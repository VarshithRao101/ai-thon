import "server-only";

import { type GraphIssue, validateGraph } from "@flowledger/engine";
import { and, desc, eq } from "drizzle-orm";
import { type Workflow, workflows, workflowVersions } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import {
  definitionHash,
  normalizeDefinition,
  referencesOf,
  toEngineGraph,
} from "./definition";

export type PublishResult =
  | { ok: true; versionId: string; version: number; definitionHash: string }
  | { ok: false; issues: GraphIssue[] };

/**
 * Validate the draft and freeze it as an immutable version (docs/07 "At
 * publish time"). Triggers then run that exact definition, and its hash goes
 * into every run receipt.
 */
export async function publishWorkflow(
  workflow: Workflow,
  userId: string,
  options: { enable?: boolean } = {}
): Promise<PublishResult> {
  const definition = normalizeDefinition(workflow.nodes, workflow.edges);
  const issues = validateGraph(
    toEngineGraph(definition),
    referencesOf(definition)
  );
  for (const node of definition.nodes) {
    if (node.type === "action" && !node.data.config.actionType) {
      issues.push({
        code: "unknown-reference",
        message: `"${node.data.label || "A step"}" has no action selected`,
        nodeId: node.id,
      });
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const hash = definitionHash(definition);
  return await tdb(async (tx) => {
    const [latest] = await tx
      .select({ version: workflowVersions.version })
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflow.id))
      .orderBy(desc(workflowVersions.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;
    const [row] = await tx
      .insert(workflowVersions)
      .values({
        workspaceId: workflow.workspaceId,
        workflowId: workflow.id,
        version,
        definition,
        definitionHash: hash,
        publishedBy: userId,
      })
      .returning({ id: workflowVersions.id });
    if (!row) {
      throw new Error("Could not create the version");
    }
    await tx
      .update(workflows)
      .set({
        publishedVersionId: row.id,
        enabled: options.enable ?? true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflows.id, workflow.id),
          eq(workflows.workspaceId, workflow.workspaceId)
        )
      );
    return {
      ok: true as const,
      versionId: row.id,
      version,
      definitionHash: hash,
    };
  });
}
