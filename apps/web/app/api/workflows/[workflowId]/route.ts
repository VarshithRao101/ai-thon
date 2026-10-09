import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, optionalTenantRoute, tenantRoute } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import { can } from "@/lib/auth/rbac";
import { workflows } from "@/lib/db/schema";
import { publicDb, tdb } from "@/lib/db/tenant";

type Params = { workflowId: string };

// Helper to strip sensitive data from nodes for public viewing
function sanitizeNodesForPublicView(
  nodes: Record<string, unknown>[]
): Record<string, unknown>[] {
  return nodes.map((node) => {
    const sanitizedNode = { ...node };
    if (
      sanitizedNode.data &&
      typeof sanitizedNode.data === "object" &&
      sanitizedNode.data !== null
    ) {
      const data = { ...(sanitizedNode.data as Record<string, unknown>) };
      // Remove integrationId from config to not expose which integrations are used
      if (
        data.config &&
        typeof data.config === "object" &&
        data.config !== null
      ) {
        const { integrationId: _, ...configWithoutIntegration } =
          data.config as Record<string, unknown>;
        data.config = configWithoutIntegration;
      }
      sanitizedNode.data = data;
    }
    return sanitizedNode;
  });
}

const notFound = () => new HttpError(404, "Workflow not found");

// GET: members see their workspace's workflow; anyone sees a public one (sanitized).
export const GET = optionalTenantRoute<Params>(
  "workflows.get",
  async (ctx, _request, { workflowId }) => {
    const query = (tx: Parameters<Parameters<typeof tdb>[0]>[0]) =>
      tx.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
    // RLS returns only own-workspace rows plus public ones.
    const [workflow] = ctx ? await tdb(query) : await publicDb(query);
    if (!workflow) {
      throw notFound();
    }

    const isMember = ctx !== null && workflow.workspaceId === ctx.workspaceId;
    if (!isMember && workflow.visibility !== "public") {
      throw notFound();
    }
    // "isOwner" drives the editor UI: members who may write get edit controls.
    const isOwner = isMember && can(ctx?.role, "workflow:write");

    return NextResponse.json({
      ...workflow,
      nodes: isMember
        ? workflow.nodes
        : sanitizeNodesForPublicView(
            workflow.nodes as Record<string, unknown>[]
          ),
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
      isOwner,
    });
  }
);

// Helper to build update data from request body
function buildUpdateData(
  body: Record<string, unknown>
): Record<string, unknown> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) {
    updateData.name = body.name;
  }
  if (body.description !== undefined) {
    updateData.description = body.description;
  }
  if (body.nodes !== undefined) {
    updateData.nodes = body.nodes;
  }
  if (body.edges !== undefined) {
    updateData.edges = body.edges;
  }
  if (body.visibility !== undefined) {
    updateData.visibility = body.visibility;
  }

  return updateData;
}

export const PATCH = tenantRoute<Params>(
  "workflows.update",
  async (ctx, request, { workflowId }) => {
    const body = await request.json();

    if (
      body.visibility !== undefined &&
      body.visibility !== "private" &&
      body.visibility !== "public"
    ) {
      throw new HttpError(
        400,
        "Invalid visibility value. Must be 'private' or 'public'"
      );
    }

    const result = await tdb(async (tx) => {
      const [existing] = await tx
        .select({ visibility: workflows.visibility })
        .from(workflows)
        .where(
          and(
            eq(workflows.id, workflowId),
            eq(workflows.workspaceId, ctx.workspaceId)
          )
        )
        .limit(1);
      if (!existing) {
        return null;
      }
      const [row] = await tx
        .update(workflows)
        .set(buildUpdateData(body))
        .where(
          and(
            eq(workflows.id, workflowId),
            eq(workflows.workspaceId, ctx.workspaceId)
          )
        )
        .returning();
      return { previousVisibility: existing.visibility, updated: row };
    });

    if (!result?.updated) {
      throw notFound();
    }
    const { updated, previousVisibility } = result;
    if (
      body.visibility !== undefined &&
      body.visibility !== previousVisibility
    ) {
      await recordAudit(
        "workflow.visibility_change",
        { type: "workflow", id: workflowId },
        { from: previousVisibility, to: body.visibility }
      );
    }

    return NextResponse.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      isOwner: true,
    });
  },
  { permission: "workflow:write" }
);

export const DELETE = tenantRoute<Params>(
  "workflows.delete",
  async (ctx, _request, { workflowId }) => {
    // Executions and their logs cascade (FK on delete cascade).
    const deleted = await tdb((tx) =>
      tx
        .delete(workflows)
        .where(
          and(
            eq(workflows.id, workflowId),
            eq(workflows.workspaceId, ctx.workspaceId)
          )
        )
        .returning({ id: workflows.id, name: workflows.name })
    );
    if (deleted.length === 0) {
      throw notFound();
    }
    await recordAudit(
      "workflow.delete",
      { type: "workflow", id: workflowId },
      { name: deleted[0]?.name }
    );
    return NextResponse.json({ success: true });
  },
  { permission: "workflow:write" }
);
