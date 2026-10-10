/** Hive engine types (docs/07). The engine never does I/O itself. */

export type NodeKind = "trigger" | "action";

/** What happens when a node fails after its retries are exhausted. */
export type OnError = "stop" | "continue" | "branch";

export type RetryPolicy = {
  /** Total attempts including the first one. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type EngineNode = {
  id: string;
  kind: NodeKind;
  label: string;
  /** Disabled nodes are skipped but pass control through (output null). */
  enabled: boolean;
  onError?: OnError;
  retry?: Partial<RetryPolicy>;
  timeoutMs?: number;
  /** Optional circuit-breaker key, e.g. the integration type. */
  breakerKey?: string;
};

export type EngineEdge = {
  id: string;
  source: string;
  target: string;
  /** Output handle: null/undefined = default, "true"/"false" for conditions, "error" for onError=branch. */
  sourceHandle?: string | null;
};

export type Graph = { nodes: EngineNode[]; edges: EngineEdge[] };

/**
 * retryable: transient (network, timeout, 429, 5xx); retried with backoff.
 * auth: bad or expired credential. validation: bad config or data. fatal: anything else.
 * Only `retryable` is retried: side effects (emails, rows) must not be repeated
 * on an ambiguous failure.
 */
export type ErrorClass = "retryable" | "auth" | "validation" | "fatal";

export type StepError = {
  message: string;
  class: ErrorClass;
  retryAfterMs?: number;
};

export type NodeOutcome =
  | { status: "success"; output: unknown; branch?: string }
  | { status: "error"; error: StepError }
  /** Durable wait (Delay node): the run checkpoints and resumes at `resumeAt`. */
  | { status: "suspend"; resumeAt: Date };

export type NodeStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "skipped"
  | "waiting";

/** Persisted progress for one node, used to resume a run without redoing work. */
export type CheckpointEntry =
  | { status: "success"; output: unknown; branch?: string }
  | { status: "skipped" }
  /** Failed with onError=continue/branch: downstream already decided. */
  | { status: "error"; error: StepError; handled: true }
  | { status: "waiting"; resumeAt: string };

export type Checkpoint = Record<string, CheckpointEntry>;

export type NodeState = {
  status: NodeStatus;
  output?: unknown;
  branch?: string;
  error?: StepError;
  attempts: number;
  resumeAt?: Date;
};

export type ExecuteNodeArgs = {
  node: EngineNode;
  /** Outputs of finished nodes, keyed by node id. */
  outputs: Readonly<Record<string, unknown>>;
  attempt: number;
  /** Stable per (run, node): pass to providers that support idempotency keys. */
  idempotencyKey: string;
  signal: AbortSignal;
};

export type ExecuteNode = (args: ExecuteNodeArgs) => Promise<NodeOutcome>;

export type RunHooks = {
  onNodeStart?: (node: EngineNode, attempt: number) => void | Promise<void>;
  onNodeFinish?: (
    node: EngineNode,
    state: NodeState,
    info: { attempt: number; durationMs: number }
  ) => void | Promise<void>;
  onNodeRetry?: (
    node: EngineNode,
    info: { attempt: number; delayMs: number; error: StepError }
  ) => void | Promise<void>;
};

export type RunStatus = "success" | "error" | "waiting" | "cancelled";

export type RunResult = {
  status: RunStatus;
  nodes: Record<string, NodeState>;
  /** Earliest wake-up when status is "waiting". */
  resumeAt?: Date;
  /** The node that stopped the run when status is "error". */
  failedNodeId?: string;
};
