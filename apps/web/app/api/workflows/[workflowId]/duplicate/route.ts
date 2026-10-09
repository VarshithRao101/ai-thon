import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import { workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { generateId } from "@/lib/utils/id";

// Node type for type-safe node manipulation
type WorkflowNodeLike = {
  id: string;
  data?: {
    config?: {
      integrationId?: string;
      [key: string]: unknown;
    };
    status?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

// Helper to strip integration IDs from nodes when duplicating
function stripIntegrationIds(nodes: WorkflowNodeLike[]): WorkflowNodeLike[] {
  return nodes.map((node) => {
    const newNode: WorkflowNodeLike = { ...node, id: nanoid() };
    if (newNode.data) {
      const data = { ...newNode.data };
      if (data.config) {
        const { integrationId: _, ...configWithoutIntegration } = data.config;
        data.config = configWithoutIntegration;
      }
      // Reset status to idle
      data.status = "idle";
      newNode.data = data;
    }
    return newNode;
  });
}

// Edge type for type-safe edge manipulation
type WorkflowEdgeLike = {
  id: string;
  source: string;
  target: string;
  [key: string]: unknown;
};

// Helper to update edge references to new node IDs
function updateEdgeReferences(
  edges: WorkflowEdgeLike[],
  oldNodes: WorkflowNodeLike[],
  newNodes: WorkflowNodeLike[]
): WorkflowEdgeLike[] {
  // Create mapping from old node IDs to new node IDs
  const idMap = new Map<string, string>();
  oldNodes.forEach((oldNode, index) => {
    idMap.set(oldNode.id, newNodes[index].id);
  });

  return edges.map((edge) => ({
    ...edge,
    id: nanoid(),
    source: idMap.get(edge.source) || edge.source,
    target: idMap.get(edge.target) || edge.target,
  }));
}

// Copy a workflow (own workspace or any public one) into the active workspace.
export const POST = tenantRoute<{ workflowId: string }>(
  "workflows.duplicate",
  async (ctx, _request, { workflowId }) => {
    const created = await tdb(async (tx) => {
      // RLS: visible only if it is in this workspace or public.
      const [source] = await tx
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflowId))
        .limit(1);
      if (!source) {
        return null;
      }

      // Generate new IDs for nodes (integration references are never copied)
      const oldNodes = source.nodes as WorkflowNodeLike[];
      const newNodes = stripIntegrationIds(oldNodes);
      const newEdges = updateEdgeReferences(
        source.edges as WorkflowEdgeLike[],
        oldNodes,
        newNodes
      );

      // Generate a unique name within this workspace
      const existingNames = new Set(
        (
          await tx
            .select({ name: workflows.name })
            .from(workflows)
            .where(eq(workflows.workspaceId, ctx.workspaceId))
        ).map((w) => w.name)
      );
      const baseName = `${source.name} (Copy)`;
      let workflowName = baseName;
      if (existingNames.has(workflowName)) {
        let counter = 2;
        while (existingNames.has(`${baseName} ${counter}`)) {
          counter += 1;
        }
        workflowName = `${baseName} ${counter}`;
      }

      const [row] = await tx
        .insert(workflows)
        .values({
          id: generateId(),
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          name: workflowName,
          description: source.description,
          nodes: newNodes,
          edges: newEdges,
          visibility: "private", // Duplicated workflows are always private
        })
        .returning();
      return row;
    });

    if (!created) {
      throw new HttpError(404, "Workflow not found");
    }
    await recordAudit(
      "workflow.create",
      { type: "workflow", id: created.id },
      { duplicatedFrom: workflowId }
    );

    return NextResponse.json({
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      isOwner: true,
    });
  },
  { permission: "workflow:write" }
);
