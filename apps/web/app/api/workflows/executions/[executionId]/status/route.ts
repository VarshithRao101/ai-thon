import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { workflowExecutionLogs, workflowExecutions } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";

type NodeStatus = {
  nodeId: string;
  status: "pending" | "running" | "success" | "error";
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
        .where(eq(workflowExecutionLogs.executionId, executionId));
      return { status: execution.status, logs };
    });

    if (!result) {
      throw new HttpError(404, "Execution not found");
    }
    const nodeStatuses: NodeStatus[] = result.logs;
    return NextResponse.json({ status: result.status, nodeStatuses });
  },
  { permission: "workflow:read" }
);
