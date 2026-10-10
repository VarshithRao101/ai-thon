import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { workflowExecutionLogs, workflowExecutions } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";

type NodeStatus = {
  nodeId: string;
  status: "idle" | "running" | "success" | "error";
};

// Canvas colors: a skipped branch stays idle; a durable wait shows as running.
const CANVAS_STATUS: Record<string, NodeStatus["status"]> = {
  pending: "running",
  running: "running",
  waiting: "running",
  success: "success",
  error: "error",
  skipped: "idle",
};

export const GET = tenantRoute<{ executionId: string }>(
  "executions.status",
  async (ctx, _request, { executionId }) => {
    const result = await tdb(async (tx) => {
      const [execution] = await tx
        .select({ status: workflowExecutions.status })
        .from(workflowExecutions)
        .where(
          and(
            eq(workflowExecutions.id, executionId),
            eq(workflowExecutions.workspaceId, ctx.workspaceId)
          )
        )
        .limit(1);
      if (!execution) {
        return null;
      }
      const logs = await tx
        .select({
          nodeId: workflowExecutionLogs.nodeId,
          status: workflowExecutionLogs.status,
        })
        .from(workflowExecutionLogs)
        .where(eq(workflowExecutionLogs.executionId, executionId))
        .orderBy(asc(workflowExecutionLogs.startedAt));
      return { status: execution.status, logs };
    });

    if (!result) {
      throw new HttpError(404, "Execution not found");
    }
    // One row per attempt: the latest row decides each node's color.
    const latest = new Map<string, NodeStatus>();
    for (const log of result.logs) {
      latest.set(log.nodeId, {
        nodeId: log.nodeId,
        status: CANVAS_STATUS[log.status] ?? "idle",
      });
    }
    const nodeStatuses = [...latest.values()];
    return NextResponse.json({ status: result.status, nodeStatuses });
  },
  { permission: "workflow:read" }
);
