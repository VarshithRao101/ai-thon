import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import type { RequestContext } from "@/lib/auth/context";
import { workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { generateId } from "@/lib/utils/id";

const CURRENT_WORKFLOW_NAME = "~~__CURRENT__~~";

// The auto-saved scratch workflow belongs to one user inside one workspace.
function scratchFilter(ctx: RequestContext) {
  return and(
    eq(workflows.workspaceId, ctx.workspaceId),
    eq(workflows.userId, ctx.userId),
    eq(workflows.name, CURRENT_WORKFLOW_NAME)
  );
}

export const GET = tenantRoute(
  "workflows.current.get",
  async (ctx) => {
    const [current] = await tdb((tx) =>
      tx
        .select()
        .from(workflows)
        .where(scratchFilter(ctx))
        .orderBy(desc(workflows.updatedAt))
        .limit(1)
    );
    if (!current) {
      return NextResponse.json({ nodes: [], edges: [] });
    }
    return NextResponse.json({
      id: current.id,
      nodes: current.nodes,
      edges: current.edges,
    });
  },
  { permission: "workflow:read" }
);

export const POST = tenantRoute(
  "workflows.current.save",
  async (ctx, request) => {
    const body = await request.json();
    const { nodes, edges } = body;
    if (!(nodes && edges)) {
      throw new HttpError(400, "Nodes and edges are required");
    }

    const saved = await tdb(async (tx) => {
      const [existing] = await tx
        .select({ id: workflows.id })
        .from(workflows)
        .where(scratchFilter(ctx))
        .limit(1);
      if (existing) {
        const [updated] = await tx
          .update(workflows)
          .set({ nodes, edges, updatedAt: new Date() })
          .where(eq(workflows.id, existing.id))
          .returning();
        return updated;
      }
      const [created] = await tx
        .insert(workflows)
        .values({
          id: generateId(),
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          name: CURRENT_WORKFLOW_NAME,
          description: "Auto-saved current workflow",
          nodes,
          edges,
        })
        .returning();
      return created;
    });

    return NextResponse.json({
      id: saved?.id,
      nodes: saved?.nodes,
      edges: saved?.edges,
    });
  },
  { permission: "workflow:write" }
);
