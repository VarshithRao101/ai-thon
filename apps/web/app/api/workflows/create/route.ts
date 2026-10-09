import { count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import { workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { generateId } from "@/lib/utils/id";

// Helper function to create a default trigger node
function createDefaultTriggerNode() {
  return {
    id: nanoid(),
    type: "trigger" as const,
    position: { x: 0, y: 0 },
    data: {
      label: "",
      description: "",
      type: "trigger" as const,
      config: { triggerType: "Manual" },
      status: "idle" as const,
    },
  };
}

export const POST = tenantRoute(
  "workflows.create",
  async (ctx, request) => {
    const body = await request.json();
    if (!(body.name && body.nodes && body.edges)) {
      throw new HttpError(400, "Name, nodes, and edges are required");
    }

    // Ensure there's always a trigger node (only add one if nodes array is empty)
    const nodes =
      body.nodes.length === 0 ? [createDefaultTriggerNode()] : body.nodes;

    const created = await tdb(async (tx) => {
      // Generate "Untitled N" name if the provided name is "Untitled Workflow"
      let name: string = body.name;
      if (name === "Untitled Workflow") {
        const [existing] = await tx
          .select({ n: count() })
          .from(workflows)
          .where(eq(workflows.workspaceId, ctx.workspaceId));
        name = `Untitled ${(existing?.n ?? 0) + 1}`;
      }
      const [row] = await tx
        .insert(workflows)
        .values({
          id: generateId(),
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          name,
          description: body.description,
          nodes,
          edges: body.edges,
        })
        .returning();
      return row;
    });

    if (!created) {
      throw new HttpError(500, "Failed to create workflow");
    }
    await recordAudit("workflow.create", { type: "workflow", id: created.id });

    return NextResponse.json({
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    });
  },
  { permission: "workflow:write" }
);
