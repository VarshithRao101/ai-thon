import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { generateWorkflowSDKCode } from "@/lib/workflow-codegen-sdk";

export const GET = tenantRoute<{ workflowId: string }>(
  "workflows.code",
  async (ctx, _request, { workflowId }) => {
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
    const code = generateWorkflowSDKCode(
      workflow.name,
      workflow.nodes,
      workflow.edges
    );
    return NextResponse.json({ code, workflowName: workflow.name });
  },
  { permission: "workflow:read" }
);
