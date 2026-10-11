import "server-only";

import {
  type Checkpoint,
  CircuitBreaker,
  type EngineNode,
  type ExecuteNode,
  type NodeState,
  type RunResult,
  runGraph,
  type StepError,
} from "@flowledger/engine";
import { and, asc, eq } from "drizzle-orm";
import {
  type WorkflowExecution,
  workflowExecutionLogs,
  workflowExecutions,
  workflowVersions,
} from "@/lib/db/schema";
import { runWithTenant, tdb } from "@/lib/db/tenant";
import {
  formFromConfig,
  sampleSubmission,
  submittedAtIst,
} from "@/lib/forms/schema";
import { getActionLabel, getStepImporter } from "@/lib/step-registry";
import { redactSensitiveData } from "@/lib/utils/redact";
import { openForWorkspace, sealForWorkspace } from "@/lib/vault";
import {
  type Definition,
  type DefinitionNode,
  toEngineGraph,
} from "./definition";
import { publishEvent } from "./events";
import type { RunJobData } from "./queues";
import {
  evaluateCondition,
  type NodeOutputs,
  processTemplates,
  sanitizeNodeId,
} from "./templates";

/** Fails fast per provider when an integration keeps failing (docs/07). */
const breaker = new CircuitBreaker();

const TERMINAL = new Set(["success", "error", "cancelled", "skipped"]);
const INTERNAL_INPUT_FIELDS = new Set([
  "actionType",
  "integrationId",
  "_context",
]);

type StepModule = Record<
  string,
  (input: Record<string, unknown>) => Promise<unknown>
>;
type SystemStep = { importer: () => Promise<StepModule>; stepFunction: string };

// The template's "Database Query" step is not exposed: it connects to any user-supplied URL (SSRF).
const SYSTEM_STEPS: Record<string, SystemStep> = {
  "HTTP Request": {
    importer: () =>
      import("@/lib/steps/http-request") as unknown as Promise<StepModule>,
    stepFunction: "httpRequestStep",
  },
};

/** What the scheduler hands back after a pass over the graph. */
export type RunOutcome = {
  status: RunResult["status"];
  resumeAt?: Date;
};

/** Execute (or resume) one run inside its workspace's tenant context. */
export function runExecution(job: RunJobData): Promise<RunOutcome | null> {
  return runWithTenant({ workspaceId: job.workspaceId }, () =>
    execute(job.executionId, job.workspaceId)
  );
}

const AUTH_PATTERN =
  /\b(401|403)\b|unauthori[sz]ed|forbidden|invalid[ _-]?(api[ _-]?)?(key|token|grant|credentials)|authentication|not authorized|permission denied/i;
const RETRYABLE_PATTERN =
  /\b(408|429|500|502|503|504)\b|rate.?limit|timed?.?out|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|temporar|unavailable|fetch failed|overloaded/i;

/** Map a step's returned error (string or structured) to an engine error class. */
export function classifyStepError(error: unknown): StepError {
  if (error && typeof error === "object" && "message" in error) {
    const structured = error as Partial<StepError> & { message: unknown };
    const message = String(structured.message);
    if (
      structured.class === "retryable" ||
      structured.class === "auth" ||
      structured.class === "validation" ||
      structured.class === "fatal"
    ) {
      return {
        message,
        class: structured.class,
        retryAfterMs: structured.retryAfterMs,
      };
    }
    return classifyStepError(message);
  }
  const message =
    typeof error === "string" && error
      ? error
      : "Step failed without a message";
  if (AUTH_PATTERN.test(message)) {
    return { message, class: "auth" };
  }
  if (RETRYABLE_PATTERN.test(message)) {
    return { message, class: "retryable" };
  }
  return { message, class: "validation" };
}

function isErrorResult(
  value: unknown
): value is { success: false; error?: unknown } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "success" in value &&
      (value as { success: unknown }).success === false
  );
}

/** Delay node config → milliseconds (`delaySeconds`, `delayMinutes`, or `delayHours`). */
function delayMs(config: Record<string, unknown>): number {
  const n = (key: string) => {
    const value = Number(config[key]);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  return (
    (n("delaySeconds") + n("delayMinutes") * 60 + n("delayHours") * 3600) * 1000
  );
}

/**
 * Manual test runs have no real payload: use the webhook's mock request, or
 * sample answers for a form, so every downstream step has data to work with.
 */
function testInputFor(
  triggerType: string,
  config: Record<string, unknown>,
  trigger: string
): Record<string, unknown> {
  if (trigger !== "manual") {
    return {};
  }
  if (triggerType === "Form") {
    return {
      ...sampleSubmission(formFromConfig(config)),
      submittedAt: submittedAtIst(),
      submissionNumber: 1,
      consent: true,
      test: true,
    };
  }
  if (
    triggerType === "Webhook" &&
    typeof config.webhookMockRequest === "string"
  ) {
    try {
      const mock = JSON.parse(config.webhookMockRequest) as unknown;
      return mock && typeof mock === "object" && !Array.isArray(mock)
        ? (mock as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function nodeName(node: DefinitionNode): string {
  if (node.data.label) {
    return node.data.label;
  }
  const actionType = node.data.config.actionType;
  if (typeof actionType === "string" && actionType) {
    return getActionLabel(actionType) ?? actionType;
  }
  const triggerType = node.data.config.triggerType;
  return typeof triggerType === "string" && triggerType
    ? triggerType
    : node.type;
}

function loggableInput(
  config: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (!INTERNAL_INPUT_FIELDS.has(key)) {
      out[key] = value;
    }
  }
  return redactSensitiveData(out) as Record<string, unknown>;
}

async function loadDefinition(
  execution: WorkflowExecution
): Promise<Definition | null> {
  if (execution.versionId) {
    const versionId = execution.versionId;
    const [version] = await tdb((tx) =>
      tx
        .select({ definition: workflowVersions.definition })
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.id, versionId),
            eq(workflowVersions.workspaceId, execution.workspaceId)
          )
        )
        .limit(1)
    );
    return (version?.definition as Definition | undefined) ?? null;
  }
  return (execution.definition as Definition | null) ?? null;
}

type LogRow = typeof workflowExecutionLogs.$inferSelect;

/** Rebuild engine progress from persisted step logs (latest row per node wins). */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one branch per persisted step status
async function buildCheckpoint(
  logs: LogRow[],
  nodes: EngineNode[],
  workspaceId: string
): Promise<Checkpoint> {
  const latest = new Map<string, LogRow>();
  for (const row of logs) {
    latest.set(row.nodeId, row);
  }
  const checkpoint: Checkpoint = {};
  for (const node of nodes) {
    const row = latest.get(node.id);
    if (!row) {
      continue;
    }
    if (row.status === "success") {
      let output: unknown = row.output;
      if (row.outputEnc) {
        output = JSON.parse(await openForWorkspace(workspaceId, row.outputEnc));
      }
      checkpoint[node.id] = {
        status: "success",
        output,
        branch: row.branch ?? undefined,
      };
    } else if (row.status === "skipped") {
      checkpoint[node.id] = { status: "skipped" };
    } else if (row.status === "waiting") {
      const resumeAt = (row.output as { resumeAt?: string } | null)?.resumeAt;
      if (resumeAt) {
        checkpoint[node.id] = { status: "waiting", resumeAt };
      }
    } else if (
      row.status === "error" &&
      (node.onError === "continue" || node.onError === "branch")
    ) {
      checkpoint[node.id] = {
        status: "error",
        error: {
          message: row.error ?? "Step failed",
          class: (row.errorClass as StepError["class"]) ?? "fatal",
        },
        handled: true,
      };
    }
    // running / unhandled error: not checkpointed, so the node runs again.
  }
  return checkpoint;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one linear run lifecycle
async function execute(
  executionId: string,
  workspaceId: string
): Promise<RunOutcome | null> {
  const [execution] = await tdb((tx) =>
    tx
      .select()
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.id, executionId),
          eq(workflowExecutions.workspaceId, workspaceId)
        )
      )
      .limit(1)
  );
  if (!execution || TERMINAL.has(execution.status)) {
    // Redelivered after completion (or deleted): nothing to do. Idempotent by design.
    return null;
  }

  const definition = await loadDefinition(execution);
  if (!definition) {
    await finishRun(execution, "error", {
      error: "Workflow definition not found for this run",
    });
    return { status: "error" };
  }

  const graph = toEngineGraph(definition);
  const byId = new Map(definition.nodes.map((n) => [n.id, n]));
  const labelOf = (id: string) => byId.get(id)?.data.label || id;

  await tdb((tx) =>
    tx
      .update(workflowExecutions)
      .set({
        status: "running",
        attempt: execution.attempt + 1,
        heartbeatAt: new Date(),
      })
      .where(eq(workflowExecutions.id, executionId))
  );
  await publishEvent({
    workspaceId,
    workflowId: execution.workflowId,
    executionId,
    kind: "run",
    status: "running",
  });

  const priorLogs = await tdb((tx) =>
    tx
      .select()
      .from(workflowExecutionLogs)
      .where(eq(workflowExecutionLogs.executionId, executionId))
      .orderBy(asc(workflowExecutionLogs.startedAt))
  );
  // Steps left "running" by a crashed worker are closed out; they will run again.
  const interrupted = priorLogs.filter((row) => row.status === "running");
  if (interrupted.length > 0) {
    await tdb(async (tx) => {
      for (const row of interrupted) {
        await tx
          .update(workflowExecutionLogs)
          .set({
            status: "error",
            error: "Interrupted: the worker restarted",
            errorClass: "retryable",
            completedAt: new Date(),
          })
          .where(eq(workflowExecutionLogs.id, row.id));
      }
    });
    for (const row of interrupted) {
      row.status = "error";
    }
  }
  const checkpoint = await buildCheckpoint(priorLogs, graph.nodes, workspaceId);
  const logged = new Set(Object.keys(checkpoint));

  const triggerInput = (execution.input ?? {}) as Record<string, unknown>;
  const rows = new Map<string, Promise<string | null>>();

  const startLog = (
    node: EngineNode,
    attempt: number,
    nodeType: string,
    input: unknown
  ) => {
    const defNode = byId.get(node.id);
    const promise = tdb((tx) =>
      tx
        .insert(workflowExecutionLogs)
        .values({
          workspaceId,
          executionId,
          nodeId: node.id,
          nodeName: defNode ? nodeName(defNode) : node.label,
          nodeType,
          status: "running",
          attempt,
          input,
          startedAt: new Date(),
        })
        .returning({ id: workflowExecutionLogs.id })
    )
      .then(([row]) => row?.id ?? null)
      .catch((error: unknown) => {
        console.error("[hive] could not log step start:", error);
        return null;
      });
    rows.set(`${node.id}#${attempt}`, promise);
    logged.add(node.id);
    return promise;
  };

  const toNodeOutputs = (
    outputs: Readonly<Record<string, unknown>>
  ): NodeOutputs => {
    const result: NodeOutputs = {};
    for (const [id, data] of Object.entries(outputs)) {
      result[sanitizeNodeId(id)] = { label: labelOf(id), data };
    }
    return result;
  };

  // biome-ignore-start lint/complexity/noExcessiveCognitiveComplexity: executeNode dispatches trigger, system and plugin steps; onNodeFinish persists every outcome shape
  const executeNode: ExecuteNode = async ({
    node,
    outputs,
    attempt,
    idempotencyKey,
  }) => {
    const defNode = byId.get(node.id);
    if (!defNode) {
      return {
        status: "error",
        error: { message: `Unknown node ${node.id}`, class: "fatal" },
      };
    }
    const config = defNode.data.config;

    if (defNode.type === "trigger") {
      const triggerType = String(config.triggerType ?? "Manual");
      const data = {
        ...testInputFor(triggerType, config, execution.trigger),
        ...triggerInput,
      };
      await startLog(node, attempt, "trigger", redactSensitiveData(data));
      return {
        status: "success",
        output: {
          triggered: true,
          timestamp: Date.now(),
          trigger: triggerType,
          runId: executionId,
          ...data,
        },
      };
    }

    const actionType =
      typeof config.actionType === "string" ? config.actionType : "";
    const nodeOutputs = toNodeOutputs(outputs);

    if (!actionType) {
      await startLog(node, attempt, "action", {});
      return {
        status: "error",
        error: {
          message: `"${nodeName(defNode)}" has no action selected`,
          class: "validation",
        },
      };
    }

    if (actionType === "Condition") {
      const { result: passed, resolvedValues } = evaluateCondition(
        config.condition,
        nodeOutputs
      );
      await startLog(node, attempt, actionType, {
        expression: config.condition,
        values: redactSensitiveData(resolvedValues),
      });
      return {
        status: "success",
        output: { condition: passed },
        branch: String(passed),
      };
    }

    if (actionType === "Delay") {
      const ms = delayMs(config);
      await startLog(node, attempt, actionType, loggableInput(config));
      if (ms <= 0) {
        return { status: "success", output: { waitedMs: 0 } };
      }
      return { status: "suspend", resumeAt: new Date(Date.now() + ms) };
    }

    const processed = processTemplates(
      { ...config, condition: undefined },
      nodeOutputs
    );
    await startLog(node, attempt, actionType, loggableInput(processed));

    const system = SYSTEM_STEPS[actionType];
    const importer = system ?? getStepImporter(actionType);
    if (!importer) {
      return {
        status: "error",
        error: {
          message: `Unknown action "${actionType}"`,
          class: "validation",
        },
      };
    }
    const module = (await importer.importer()) as StepModule;
    const stepFunction = module[importer.stepFunction];
    if (typeof stepFunction !== "function") {
      return {
        status: "error",
        error: {
          message: `Step "${importer.stepFunction}" is missing for "${actionType}"`,
          class: "fatal",
        },
      };
    }

    // Heartbeat so a reconciler can tell a live run from a dead one.
    tdb((tx) =>
      tx
        .update(workflowExecutions)
        .set({ heartbeatAt: new Date() })
        .where(eq(workflowExecutions.id, executionId))
    ).catch(() => undefined);

    const result = await stepFunction({
      ...processed,
      _context: {
        executionId,
        nodeId: node.id,
        nodeName: nodeName(defNode),
        nodeType: actionType,
        managed: true,
        idempotencyKey,
      },
    });
    if (isErrorResult(result)) {
      return { status: "error", error: classifyStepError(result.error) };
    }
    return { status: "success", output: result };
  };

  const onNodeFinish = async (
    node: EngineNode,
    state: NodeState,
    info: { attempt: number; durationMs: number }
  ) => {
    const status = state.status === "waiting" ? "waiting" : state.status;
    const output =
      state.status === "waiting"
        ? { resumeAt: state.resumeAt?.toISOString() }
        : (state.output ?? null);
    const outputEnc =
      state.status === "success" && state.output !== undefined
        ? await sealForWorkspace(workspaceId, JSON.stringify(state.output))
        : null;
    const values = {
      status: status as LogRow["status"],
      output: redactSensitiveData(output),
      outputEnc,
      branch: state.branch ?? null,
      error: state.error?.message ?? null,
      errorClass: state.error?.class ?? null,
      completedAt: new Date(),
      duration: String(info.durationMs),
    };

    const rowId =
      info.attempt > 0 ? await rows.get(`${node.id}#${info.attempt}`) : null;
    if (rowId) {
      await tdb((tx) =>
        tx
          .update(workflowExecutionLogs)
          .set(values)
          .where(eq(workflowExecutionLogs.id, rowId))
      );
    } else {
      // Pass-through (disabled node) or a durable wait that has elapsed.
      const defNode = byId.get(node.id);
      await tdb((tx) =>
        tx.insert(workflowExecutionLogs).values({
          workspaceId,
          executionId,
          nodeId: node.id,
          nodeName: defNode ? nodeName(defNode) : node.label,
          nodeType:
            defNode?.type === "trigger"
              ? "trigger"
              : String(defNode?.data.config.actionType ?? "action"),
          attempt: info.attempt,
          input: null,
          startedAt: new Date(),
          ...values,
        })
      );
      logged.add(node.id);
    }
    await publishEvent({
      workspaceId,
      workflowId: execution.workflowId,
      executionId,
      kind: "step",
      status,
      nodeId: node.id,
      attempt: info.attempt,
    });
  };

  // biome-ignore-end lint/complexity/noExcessiveCognitiveComplexity: see biome-ignore-start above
  const result = await runGraph({
    graph,
    executeNode,
    executionKey: executionId,
    checkpoint,
    breaker,
    maxParallel: 4,
    hooks: {
      onNodeStart: (node, attempt) =>
        publishEvent({
          workspaceId,
          workflowId: execution.workflowId,
          executionId,
          kind: "step",
          status: "running",
          nodeId: node.id,
          attempt,
        }),
      onNodeFinish,
    },
  });

  // Branches not taken: record them so the timeline and the receipt cover every node.
  const skipped = graph.nodes.filter(
    (n) => result.nodes[n.id]?.status === "skipped" && !logged.has(n.id)
  );
  if (skipped.length > 0) {
    await tdb((tx) =>
      tx.insert(workflowExecutionLogs).values(
        skipped.map((n) => {
          const defNode = byId.get(n.id);
          return {
            workspaceId,
            executionId,
            nodeId: n.id,
            nodeName: defNode ? nodeName(defNode) : n.label,
            nodeType: String(
              defNode?.data.config.actionType ?? defNode?.type ?? "action"
            ),
            status: "skipped" as const,
            attempt: 0,
            startedAt: new Date(),
            completedAt: new Date(),
            duration: "0",
          };
        })
      )
    );
  }

  if (result.status === "waiting") {
    await tdb((tx) =>
      tx
        .update(workflowExecutions)
        .set({ status: "waiting" })
        .where(eq(workflowExecutions.id, executionId))
    );
    await publishEvent({
      workspaceId,
      workflowId: execution.workflowId,
      executionId,
      kind: "run",
      status: "waiting",
    });
    return { status: "waiting", resumeAt: result.resumeAt };
  }

  if (result.status === "error") {
    const failed = result.failedNodeId
      ? result.nodes[result.failedNodeId]
      : undefined;
    const label = result.failedNodeId ? labelOf(result.failedNodeId) : "A step";
    await finishRun(execution, "error", {
      error: `${label}: ${failed?.error?.message ?? "failed"}`,
    });
    return { status: "error" };
  }

  if (result.status === "cancelled") {
    await finishRun(execution, "cancelled", {});
    return { status: "cancelled" };
  }

  // Output = the last successful action in definition order.
  const lastOutput = [...definition.nodes]
    .reverse()
    .map((n) => result.nodes[n.id])
    .find((s) => s?.status === "success")?.output;
  await finishRun(execution, "success", {
    output: redactSensitiveData(lastOutput ?? null),
  });
  return { status: "success" };
}

async function finishRun(
  execution: WorkflowExecution,
  status: "success" | "error" | "cancelled",
  fields: { output?: unknown; error?: string }
) {
  const completedAt = new Date();
  await tdb((tx) =>
    tx
      .update(workflowExecutions)
      .set({
        status,
        output: fields.output as WorkflowExecution["output"],
        error: fields.error ?? null,
        completedAt,
        duration: String(completedAt.getTime() - execution.startedAt.getTime()),
      })
      .where(eq(workflowExecutions.id, execution.id))
  );
  await publishEvent({
    workspaceId: execution.workspaceId,
    workflowId: execution.workflowId,
    executionId: execution.id,
    kind: "run",
    status,
  });
}
