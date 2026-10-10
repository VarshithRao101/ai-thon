import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import { workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { syncSchedule } from "@/lib/hive/schedules";

// PUT /api/workflows/{id}/enabled { enabled }: the on/off switch for triggers
export const PUT = tenantRoute<{ workflowId: string }>(
  "workflows.enabled",
  async (ctx, request, { workflowId }) => {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.enabled !== "boolean") {
      throw new HttpError(400, "Body must be { enabled: boolean }");
    }
    const enabled: boolean = body.enabled;
    const [workflow] = await tdb((tx) =>
      tx
        .select({
          id: workflows.id,
          publishedVersionId: workflows.publishedVersionId,
        })
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
    if (enabled && !workflow.publishedVersionId) {
      throw new HttpError(409, "Publish the workflow before enabling it");
    }
    await tdb((tx) =>
      tx
        .update(workflows)
        .set({ enabled, updatedAt: new Date() })
        .where(
          and(
            eq(workflows.id, workflowId),
            eq(workflows.workspaceId, ctx.workspaceId)
          )
        )
    );
    await syncSchedule(workflowId, ctx.workspaceId);
    await recordAudit(enabled ? "workflow.enable" : "workflow.disable", {
      type: "workflow",
      id: workflowId,
    });
    return NextResponse.json({ enabled });
  },
  { permission: "workflow:write" }
);
