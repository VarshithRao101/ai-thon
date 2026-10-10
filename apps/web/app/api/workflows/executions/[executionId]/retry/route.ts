import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import { workflowExecutions } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { enqueueRun } from "@/lib/hive/ingress";

// POST /api/workflows/executions/{id}/retry: resume a failed run from the failed step.
// Completed steps are checkpointed in the step logs and are not repeated.
export const POST = tenantRoute<{ executionId: string }>(
  "executions.retry",
  async (ctx, _request, { executionId }) => {
    const [updated] = await tdb((tx) =>
      tx
        .update(workflowExecutions)
        .set({
          status: "queued",
          error: null,
          completedAt: null,
          duration: null,
        })
        .where(
          and(
            eq(workflowExecutions.id, executionId),
            eq(workflowExecutions.workspaceId, ctx.workspaceId),
            eq(workflowExecutions.status, "error")
          )
        )
        .returning({ id: workflowExecutions.id })
    );
    if (!updated) {
      throw new HttpError(409, "Only failed runs can be retried");
    }
    await enqueueRun({ executionId, workspaceId: ctx.workspaceId });
    await recordAudit("run.retry", { type: "execution", id: executionId });
    return NextResponse.json({ executionId, status: "queued" });
  },
  { permission: "run:operate" }
);
