import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { optionalTenantRoute } from "@/lib/api/route";
import { workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";

// GET /api/workflows: the active workspace's workflows (signed out: none)
export const GET = optionalTenantRoute("workflows.list", async (ctx) => {
  if (!ctx) {
    return NextResponse.json([]);
  }
  // Explicit workspace filter: RLS would also show other tenants' public workflows.
  const rows = await tdb((tx) =>
    tx
      .select()
      .from(workflows)
      .where(eq(workflows.workspaceId, ctx.workspaceId))
      .orderBy(desc(workflows.updatedAt))
  );
  return NextResponse.json(
    rows.map((workflow) => ({
      ...workflow,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
    }))
  );
});
