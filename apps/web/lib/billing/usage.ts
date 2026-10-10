import "server-only";

import { and, eq, gte, ne, sql } from "drizzle-orm";
import { HttpError } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import { auditEvents, workflows, workspaces } from "@/lib/db/schema";
import { requireTenant, tdb } from "@/lib/db/tenant";
import { monthWindow, type PlanLimits, planFor } from "./plans";

export type Meter = { used: number; limit: number | null };
export type Usage = {
  plan: PlanLimits;
  workflows: Meter;
  aiMessages: Meter & { resetsAt: string };
};

/** The active workspace's plan and how much of it is used. */
export async function getUsage(): Promise<Usage> {
  const { workspaceId } = requireTenant();
  const { start, resetsAt } = monthWindow();
  return await tdb(async (tx) => {
    const [ws] = await tx
      .select({ plan: workspaces.plan })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const [flows] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(workflows)
      .where(
        and(
          eq(workflows.workspaceId, workspaceId),
          ne(workflows.name, "__current__")
        )
      );
    const [ai] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.workspaceId, workspaceId),
          eq(auditEvents.action, "ai.message"),
          gte(auditEvents.at, start)
        )
      );
    const plan = planFor(ws?.plan);
    return {
      plan,
      workflows: { used: flows?.n ?? 0, limit: plan.workflows },
      aiMessages: {
        used: ai?.n ?? 0,
        limit: plan.aiMessages,
        resetsAt: resetsAt.toISOString(),
      },
    };
  });
}

const full = (m: Meter) => m.limit !== null && m.used >= m.limit;

/** 402 when the workspace has no workflow credits left. */
export async function assertWorkflowCredit(): Promise<void> {
  const usage = await getUsage();
  if (full(usage.workflows)) {
    throw new HttpError(
      402,
      `Your ${usage.plan.name} plan includes ${usage.workflows.limit} workflows. Delete one or upgrade to create more.`
    );
  }
}

/** Use one AI message, or 402 when this month's are used up. */
export async function consumeAiMessage(): Promise<Usage> {
  const usage = await getUsage();
  if (full(usage.aiMessages)) {
    const resets = new Date(usage.aiMessages.resetsAt).toLocaleDateString(
      "en-IN",
      {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata",
      }
    );
    throw new HttpError(
      402,
      `You've used all ${usage.aiMessages.limit} AI messages on your ${usage.plan.name} plan this month. They reset on ${resets}, or upgrade for more.`
    );
  }
  await recordAudit("ai.message");
  return {
    ...usage,
    aiMessages: { ...usage.aiMessages, used: usage.aiMessages.used + 1 },
  };
}
