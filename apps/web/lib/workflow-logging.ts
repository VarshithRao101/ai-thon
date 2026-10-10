/**
 * Server-only workflow logging functions
 * These replace the HTTP endpoint for better security
 */
import "server-only";

import { eq } from "drizzle-orm";
import { workflowExecutionLogs, workflowExecutions } from "@/lib/db/schema";
import { requireTenant, tdb } from "@/lib/db/tenant";

// All writes run in the run's tenant context (set by the Hive runner, lib/hive/runner.ts),
// so Postgres RLS confines them to that workspace.

export type LogStepStartParams = {
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  input?: unknown;
};

export type LogStepStartResult = {
  logId: string;
  startTime: number;
};

/**
 * Log the start of a step execution
 */
export async function logStepStartDb(
  params: LogStepStartParams
): Promise<LogStepStartResult> {
  const { workspaceId } = requireTenant();
  const [log] = await tdb((tx) =>
    tx
      .insert(workflowExecutionLogs)
      .values({
        workspaceId,
        executionId: params.executionId,
        nodeId: params.nodeId,
        nodeName: params.nodeName,
        nodeType: params.nodeType,
        status: "running",
        input: params.input,
        startedAt: new Date(),
      })
      .returning()
  );

  return {
    logId: (log as { id: string }).id,
    startTime: Date.now(),
  };
}

export type LogStepCompleteParams = {
  logId: string;
  startTime: number;
  status: "success" | "error";
  output?: unknown;
  error?: string;
};

/**
 * Log the completion of a step execution
 */
export async function logStepCompleteDb(
  params: LogStepCompleteParams
): Promise<void> {
  const duration = Date.now() - params.startTime;

  await tdb((tx) =>
    tx
      .update(workflowExecutionLogs)
      .set({
        status: params.status,
        output: params.output,
        error: params.error,
        completedAt: new Date(),
        duration: duration.toString(),
      })
      .where(eq(workflowExecutionLogs.id, params.logId))
  );
}

export type LogWorkflowCompleteParams = {
  executionId: string;
  status: "success" | "error";
  output?: unknown;
  error?: string;
  startTime: number;
};

/**
 * Log the completion of a workflow execution
 */
export async function logWorkflowCompleteDb(
  params: LogWorkflowCompleteParams
): Promise<void> {
  const duration = Date.now() - params.startTime;

  await tdb((tx) =>
    tx
      .update(workflowExecutions)
      .set({
        status: params.status,
        output: params.output,
        error: params.error,
        completedAt: new Date(),
        duration: duration.toString(),
      })
      .where(eq(workflowExecutions.id, params.executionId))
  );
}
