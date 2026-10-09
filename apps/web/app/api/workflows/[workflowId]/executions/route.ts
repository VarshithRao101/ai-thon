import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import type { RequestContext } from "@/lib/auth/context";
import { workflowExecutions, workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";

type Params = { workflowId: string };

async function assertWorkflowInWorkspace(
  ctx: RequestContext,
  workflowId: string
) {
  const [workflow] = await tdb((tx) =>
    tx
      .select({ id: workflows.id })
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
}

export const GET = tenantRoute<Params>(
  "executions.list",
  async (ctx, _request, { workflowId }) => {
    await assertWorkflowInWorkspace(ctx, workflowId);
    const executions = await tdb((tx) =>
      tx
        .select()
        .from(workflowExecutions)
        .where(eq(workflowExecutions.workflowId, workflowId))
        .orderBy(desc(workflowExecutions.startedAt))
        .limit(50)
    );
    return NextResponse.json(executions);
  },
  { permission: "workflow:read" }
);

export const DELETE = tenantRoute<Params>(
  "executions.clear",
  async (ctx, _request, { workflowId }) => {
    await assertWorkflowInWorkspace(ctx, workflowId);
    // Logs cascade from executions (FK on delete cascade).
    const deleted = await tdb((tx) =>
      tx
        .delete(workflowExecutions)
        .where(eq(workflowExecutions.workflowId, workflowId))
        .returning({ id: workflowExecutions.id })
    );
    return NextResponse.json({ success: true, deletedCount: deleted.length });
  },
  { permission: "run:operate" }
);
