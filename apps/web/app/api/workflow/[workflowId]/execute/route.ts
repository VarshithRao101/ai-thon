import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { workflowExecutions, workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { dispatchExecution } from "@/lib/runtime/dispatch";
import type { WorkflowEdge, WorkflowNode } from "@/lib/workflow-store";

// POST /api/workflow/{id}/execute: manual/test run of a workflow in the active workspace
export const POST = tenantRoute<{ workflowId: string }>(
  "workflows.execute",
  async (ctx, request, { workflowId }) => {
    // Members may run only their own workspace's workflows (never a foreign public one).
    const [workflow] = await tdb((tx) =>
      tx
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.id, workflowId),
            eq(workflows.workspaceId, ctx.workspaceId)
          )
        )
        .limit(1)
    );
    if (!workflow) {
      throw new HttpError(404, "Workflow not found");
    }

    const body = await request.json().catch(() => ({}));
    const input = body.input || {};

    const [execution] = await tdb((tx) =>
      tx
        .insert(workflowExecutions)
        .values({
          workspaceId: ctx.workspaceId,
          workflowId,
          userId: ctx.userId,
          status: "running",
          input,
        })
        .returning({ id: workflowExecutions.id })
    );
    if (!execution) {
      throw new HttpError(500, "Failed to create execution");
    }

    // Steps receive only integration ids and fetch credentials inside the run.
    dispatchExecution(
      {
        nodes: workflow.nodes as WorkflowNode[],
        edges: workflow.edges as WorkflowEdge[],
        triggerInput: input,
        executionId: execution.id,
        workflowId,
      },
      { workspaceId: ctx.workspaceId, userId: ctx.userId }
    );

    return NextResponse.json({ executionId: execution.id, status: "running" });
  },
  { permission: "run:operate" }
);
