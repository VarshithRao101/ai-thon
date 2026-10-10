import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { buildWorkflow } from "@/lib/ai/plan";
import { TEMPLATES } from "@/lib/ai/templates";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { integrations } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";

// GET /api/templates/{slug}: a ready-to-save canvas, with this workspace's
// saved connections already attached.
export const GET = tenantRoute<{ slug: string }>(
  "templates.build",
  async (ctx, _request, { slug }) => {
    const template = TEMPLATES.find((t) => t.slug === slug);
    if (!template) {
      throw new HttpError(404, "Template not found");
    }
    const saved = await tdb((tx) =>
      tx
        .select({ id: integrations.id, type: integrations.type })
        .from(integrations)
        .where(eq(integrations.workspaceId, ctx.workspaceId))
    );
    const connections: Record<string, string> = {};
    for (const row of saved) {
      connections[row.type] ??= row.id;
    }
    return NextResponse.json(buildWorkflow(template.plan, connections));
  },
  { permission: "workflow:write" }
);
