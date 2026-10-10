import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { startRun } from "@/lib/hive/ingress";

// On Vercel the run executes in this function after the response (D-047).
export const maxDuration = 300;
// POST /api/workflow/{id}/execute: manual test run of the current draft (Hive queue)
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
    const input =
      body && typeof body.input === "object" && body.input !== null
        ? (body.input as Record<string, unknown>)
        : {};

    const result = await startRun({
      workflow,
      trigger: "manual",
      input,
      userId: ctx.userId,
      useDraft: true,
    });
    if (!result.ok) {
      throw new HttpError(409, result.reason);
    }
    return NextResponse.json({
      executionId: result.executionId,
      status: "queued",
    });
  },
  { permission: "run:operate" }
);
