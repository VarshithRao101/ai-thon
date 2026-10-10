import { and, desc, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { tenantRoute } from "@/lib/api/route";
import { integrations, workflowExecutions, workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { opportunisticTick } from "@/lib/hive/opportunistic";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

type Node = { type?: string; data?: { config?: Record<string, unknown> } };

function triggerOf(nodes: unknown): string {
  const trigger = (Array.isArray(nodes) ? (nodes as Node[]) : []).find(
    (n) => n.type === "trigger"
  );
  const type = trigger?.data?.config?.triggerType;
  return typeof type === "string" ? type : "Manual";
}

// GET /api/dashboard: everything the signed-in home needs in one round trip.
// Every query filters the active workspace explicitly (RLS also applies).
export const GET = tenantRoute("dashboard.read", async (ctx) => {
  opportunisticTick();
  const ws = ctx.workspaceId;
  const since = new Date(Date.now() - 7 * DAY_MS);

  const data = await tdb(async (tx) => {
    const flows = await tx
      .select({
        id: workflows.id,
        name: workflows.name,
        description: workflows.description,
        enabled: workflows.enabled,
        publishedVersionId: workflows.publishedVersionId,
        nodes: workflows.nodes,
        updatedAt: workflows.updatedAt,
        createdAt: workflows.createdAt,
      })
      .from(workflows)
      .where(eq(workflows.workspaceId, ws))
      .orderBy(desc(workflows.updatedAt));

    const perWorkflow = await tx
      .select({
        workflowId: workflowExecutions.workflowId,
        runs: sql<number>`count(*)::int`,
        lastRunAt: sql<string | null>`max(${workflowExecutions.startedAt})`,
      })
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workspaceId, ws))
      .groupBy(workflowExecutions.workflowId);

    const recent = await tx
      .select({
        id: workflowExecutions.id,
        workflowId: workflowExecutions.workflowId,
        workflowName: workflows.name,
        status: workflowExecutions.status,
        trigger: workflowExecutions.trigger,
        startedAt: workflowExecutions.startedAt,
        duration: workflowExecutions.duration,
        error: workflowExecutions.error,
      })
      .from(workflowExecutions)
      .innerJoin(workflows, eq(workflows.id, workflowExecutions.workflowId))
      .where(eq(workflowExecutions.workspaceId, ws))
      .orderBy(desc(workflowExecutions.startedAt))
      .limit(12);

    const [week] = await tx
      .select({
        runs: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) filter (where ${workflowExecutions.status} = 'success')::int`,
        failed: sql<number>`count(*) filter (where ${workflowExecutions.status} = 'error')::int`,
      })
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.workspaceId, ws),
          gte(workflowExecutions.startedAt, since)
        )
      );

    const apps = await tx
      .select({ type: integrations.type, status: integrations.status })
      .from(integrations)
      .where(eq(integrations.workspaceId, ws));

    const lastStatus = new Map<string, string>();
    for (const run of recent) {
      if (!lastStatus.has(run.workflowId)) {
        lastStatus.set(run.workflowId, run.status);
      }
    }
    const counts = new Map(perWorkflow.map((r) => [r.workflowId, r]));

    return {
      workflows: flows
        .filter((w) => w.name !== "__current__")
        .map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          enabled: w.enabled,
          published: Boolean(w.publishedVersionId),
          trigger: triggerOf(w.nodes),
          steps: Array.isArray(w.nodes)
            ? Math.max(0, (w.nodes as Node[]).length - 1)
            : 0,
          runs: counts.get(w.id)?.runs ?? 0,
          lastRunAt: counts.get(w.id)?.lastRunAt ?? null,
          lastStatus: lastStatus.get(w.id) ?? null,
          updatedAt: w.updatedAt.toISOString(),
        })),
      recentRuns: recent.map((r) => ({
        ...r,
        startedAt: r.startedAt.toISOString(),
      })),
      stats: {
        runs7d: week?.runs ?? 0,
        succeeded7d: week?.succeeded ?? 0,
        failed7d: week?.failed ?? 0,
      },
      connections: [...new Set(apps.map((a) => a.type))],
    };
  });

  return NextResponse.json(data);
});
