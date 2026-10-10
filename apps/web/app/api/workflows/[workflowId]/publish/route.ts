import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import { workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { publishWorkflow } from "@/lib/hive/publish";
import { syncSchedule } from "@/lib/hive/schedules";

// POST /api/workflows/{id}/publish: validate the draft, freeze a version, enable triggers
export const POST = tenantRoute<{ workflowId: string }>(
  "workflows.publish",
  async (ctx, request, { workflowId }) => {
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
    const result = await publishWorkflow(workflow, ctx.userId, {
      enable: body?.enable !== false,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: "The workflow has problems to fix before publishing",
          issues: result.issues,
        },
        { status: 422 }
      );
    }
    await syncSchedule(workflowId, ctx.workspaceId);
    await recordAudit(
      "workflow.publish",
      { type: "workflow", id: workflowId },
      {
        version: result.version,
        definitionHash: result.definitionHash,
      }
    );
    return NextResponse.json(result);
  },
  { permission: "workflow:write" }
);
