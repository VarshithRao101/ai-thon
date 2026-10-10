import type { CircuitBreaker } from "./breaker";
import { backoffDelay, classifyThrown, DEFAULT_RETRY, shouldRetry } from "./retry";
import type {
  Checkpoint,
  EngineEdge,
  EngineNode,
  ExecuteNode,
  Graph,
  NodeOutcome,
  NodeState,
  RetryPolicy,
  RunHooks,
  RunResult,
  StepError,
} from "./types";

export type RunOptions = {
  graph: Graph;
  executeNode: ExecuteNode;
  /** Stable id of this run; node idempotency keys derive from it. */
  executionKey: string;
  checkpoint?: Checkpoint;
  hooks?: RunHooks;
  defaultRetry?: Partial<RetryPolicy>;
  defaultTimeoutMs?: number;
  maxParallel?: number;
  signal?: AbortSignal;
  breaker?: CircuitBreaker;
  now?: () => Date;
  random?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

type InternalState = NodeState & { passThrough?: boolean; handled?: boolean };

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PARALLEL = 4;

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

class StepTimeoutError extends Error {
  constructor(ms: number) {
    super(`Step timed out after ${ms} ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Run a workflow graph (docs/07 "DAG semantics").
 *
 * A node becomes ready when every incoming edge is resolved. It runs if at
 * least one incoming edge is active (OR-join), otherwise it is skipped and the
 * skip propagates. Edge activity depends on the source's outcome and the
 * edge's handle: condition branches ("true"/"false"), error branches
 * ("error"), and pass-through for disabled nodes.
 */
export async function runGraph(options: RunOptions): Promise<RunResult> {
  const {
    graph,
    executeNode,
    executionKey,
    hooks = {},
    breaker,
    now = () => new Date(),
    random = Math.random,
    sleep = abortableSleep,
  } = options;
  const runSignal = options.signal ?? new AbortController().signal;
  const maxParallel = options.maxParallel ?? DEFAULT_MAX_PARALLEL;
  const defaultTimeout = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  const incoming = new Map<string, EngineEdge[]>();
  for (const node of graph.nodes) {
    incoming.set(node.id, []);
  }
  for (const edge of graph.edges) {
    incoming.get(edge.target)?.push(edge);
  }

  const state: Record<string, InternalState> = {};
  for (const node of graph.nodes) {
    state[node.id] = { status: "pending", attempts: 0 };
  }

  // Resume: restore finished nodes; elapsed durable waits complete now.
  const resumed: EngineNode[] = [];
  for (const node of graph.nodes) {
    const entry = options.checkpoint?.[node.id];
    if (!entry) {
      continue;
    }
    if (entry.status === "success") {
      state[node.id] = { status: "success", output: entry.output, branch: entry.branch, attempts: 0 };
    } else if (entry.status === "skipped") {
      state[node.id] = { status: "skipped", attempts: 0, passThrough: node.enabled === false };
    } else if (entry.status === "error") {
      state[node.id] = { status: "error", error: entry.error, attempts: 0, handled: true };
    } else {
      const resumeAt = new Date(entry.resumeAt);
      if (now().getTime() >= resumeAt.getTime()) {
        state[node.id] = {
          status: "success",
          output: { resumedAt: now().toISOString(), waitedUntil: entry.resumeAt },
          attempts: 0,
        };
        resumed.push(node);
      } else {
        state[node.id] = { status: "waiting", resumeAt, attempts: 0 };
      }
    }
  }
  for (const node of resumed) {
    await hooks.onNodeFinish?.(node, publicState(state[node.id] as InternalState), {
      attempt: 0,
      durationMs: 0,
    });
  }

  const isResolved = (id: string): boolean => {
    const s = state[id] as InternalState;
    return (
      s.status === "success" ||
      s.status === "skipped" ||
      (s.status === "error" && s.handled === true)
    );
  };

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const edgeActive = (edge: EngineEdge): boolean => {
    const src = state[edge.source] as InternalState;
    const handle = edge.sourceHandle ?? null;
    if (src.status === "success") {
      if (handle === "error") {
        return false;
      }
      if (src.branch === undefined) {
        return true;
      }
      return handle === null ? src.branch === "true" : handle === src.branch;
    }
    if (src.status === "skipped") {
      return src.passThrough === true && handle !== "error";
    }
    if (src.status === "error" && src.handled) {
      const policy = nodeById.get(edge.source)?.onError;
      return policy === "branch" ? handle === "error" : handle !== "error";
    }
    return false;
  };

  const outputs = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [id, s] of Object.entries(state)) {
      if (s.status === "success") {
        out[id] = s.output;
      } else if (s.status === "skipped" || (s.status === "error" && s.handled)) {
        out[id] = null;
      }
    }
    return out;
  };

  let failedNodeId: string | undefined;

  const finish = async (node: EngineNode, attempt: number, startedAt: number) => {
    await hooks.onNodeFinish?.(node, publicState(state[node.id] as InternalState), {
      attempt,
      durationMs: Date.now() - startedAt,
    });
  };

  const attemptOnce = async (node: EngineNode, attempt: number): Promise<NodeOutcome> => {
    if (node.breakerKey && breaker) {
      const decision = breaker.check(node.breakerKey);
      if (!decision.allowed) {
        return {
          status: "error",
          error: {
            message: `Circuit open for ${node.breakerKey}: too many recent failures`,
            class: "retryable",
            retryAfterMs: decision.retryAfterMs,
          },
        };
      }
    }
    const timeoutMs = node.timeoutMs ?? defaultTimeout;
    const controller = new AbortController();
    const onRunAbort = () => controller.abort(runSignal.reason);
    runSignal.addEventListener("abort", onRunAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let outcome: NodeOutcome;
    try {
      outcome = await Promise.race([
        executeNode({
          node,
          outputs: outputs(),
          attempt,
          idempotencyKey: `${executionKey}:${node.id}`,
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new StepTimeoutError(timeoutMs));
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      outcome = { status: "error", error: classifyThrown(error) };
    } finally {
      clearTimeout(timer);
      runSignal.removeEventListener("abort", onRunAbort);
    }
    if (node.breakerKey && breaker) {
      breaker.record(
        node.breakerKey,
        !(outcome.status === "error" && outcome.error.class === "retryable")
      );
    }
    return outcome;
  };

  const executeWithRetries = async (node: EngineNode): Promise<void> => {
    const policy: RetryPolicy = { ...DEFAULT_RETRY, ...options.defaultRetry, ...node.retry };
    const s = state[node.id] as InternalState;
    for (let attempt = 1; ; attempt++) {
      s.status = "running";
      s.attempts = attempt;
      await hooks.onNodeStart?.(node, attempt);
      const startedAt = Date.now();
      const outcome = await attemptOnce(node, attempt);

      if (outcome.status === "success") {
        Object.assign(s, { status: "success", output: outcome.output, branch: outcome.branch });
        await finish(node, attempt, startedAt);
        return;
      }
      if (outcome.status === "suspend") {
        Object.assign(s, { status: "waiting", resumeAt: outcome.resumeAt });
        await finish(node, attempt, startedAt);
        return;
      }

      const error: StepError = outcome.error;
      if (shouldRetry(error, attempt, policy) && !runSignal.aborted) {
        Object.assign(s, { status: "error", error });
        await finish(node, attempt, startedAt);
        const delayMs = backoffDelay(attempt, policy, random, error.retryAfterMs);
        await hooks.onNodeRetry?.(node, { attempt, delayMs, error });
        await sleep(delayMs, runSignal);
        if (runSignal.aborted) {
          return;
        }
        continue;
      }

      const handled = node.onError === "continue" || node.onError === "branch";
      Object.assign(s, { status: "error", error, handled });
      if (!handled) {
        failedNodeId ??= node.id;
      }
      await finish(node, attempt, startedAt);
      return;
    }
  };

  const running = new Map<string, Promise<void>>();

  /** Start ready nodes; settle skips synchronously. Returns true if anything changed. */
  const schedule = async (): Promise<boolean> => {
    let changed = false;
    for (const node of graph.nodes) {
      if (failedNodeId || runSignal.aborted || running.size >= maxParallel) {
        break;
      }
      const s = state[node.id] as InternalState;
      if (s.status !== "pending") {
        continue;
      }
      const edges = incoming.get(node.id) ?? [];
      if (!edges.every((e) => isResolved(e.source))) {
        continue;
      }
      const isRoot = edges.length === 0;
      const anyActive = edges.some(edgeActive);
      if ((isRoot && node.kind !== "trigger") || (!isRoot && !anyActive)) {
        // Unreachable root or every input branch was not taken: skip and propagate.
        Object.assign(s, { status: "skipped" });
        changed = true;
        continue;
      }
      if (!node.enabled) {
        Object.assign(s, { status: "skipped", passThrough: true });
        await hooks.onNodeFinish?.(node, publicState(s), { attempt: 0, durationMs: 0 });
        changed = true;
        continue;
      }
      changed = true;
      const task = executeWithRetries(node).finally(() => running.delete(node.id));
      running.set(node.id, task);
    }
    return changed;
  };

  for (;;) {
    while (await schedule()) {
      // keep settling skips/pass-throughs until no new work becomes ready
      if (running.size >= maxParallel) {
        break;
      }
    }
    if (running.size === 0) {
      break;
    }
    await Promise.race(running.values());
  }

  const nodes: Record<string, NodeState> = {};
  for (const [id, s] of Object.entries(state)) {
    nodes[id] = publicState(s);
  }

  if (failedNodeId) {
    return { status: "error", nodes, failedNodeId };
  }
  const pending = Object.values(state).some((s) => s.status === "pending");
  if (runSignal.aborted && pending) {
    return { status: "cancelled", nodes };
  }
  const waits = Object.values(state)
    .filter((s) => s.status === "waiting" && s.resumeAt)
    .map((s) => (s.resumeAt as Date).getTime());
  if (waits.length > 0) {
    return { status: "waiting", nodes, resumeAt: new Date(Math.min(...waits)) };
  }
  return { status: "success", nodes };
}

function publicState(s: InternalState): NodeState {
  const { passThrough: _p, handled: _h, ...rest } = s;
  return { ...rest };
}

/** Build the checkpoint to persist/resume from a run's node states. */
export function toCheckpoint(result: RunResult, graph: Graph): Checkpoint {
  const checkpoint: Checkpoint = {};
  for (const node of graph.nodes) {
    const s = result.nodes[node.id];
    if (!s) {
      continue;
    }
    if (s.status === "success") {
      checkpoint[node.id] = { status: "success", output: s.output, branch: s.branch };
    } else if (s.status === "skipped") {
      checkpoint[node.id] = { status: "skipped" };
    } else if (s.status === "waiting" && s.resumeAt) {
      checkpoint[node.id] = { status: "waiting", resumeAt: s.resumeAt.toISOString() };
    } else if (
      s.status === "error" &&
      s.error &&
      (node.onError === "continue" || node.onError === "branch")
    ) {
      checkpoint[node.id] = { status: "error", error: s.error, handled: true };
    }
  }
  return checkpoint;
}
