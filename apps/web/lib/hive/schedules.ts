import "server-only";

import { and, eq } from "drizzle-orm";
import { workflows, workflowVersions } from "@/lib/db/schema";
import { runWithTenant, tdb } from "@/lib/db/tenant";
import { getBoss } from "./boss";
import type { Definition } from "./definition";
import { startRun } from "./ingress";
import { QUEUES, type ScheduleJobData } from "./queues";

const CRON = /^(\S+\s+){4}\S+$/;

/**
 * Keep the pg-boss schedule in line with the workflow: a published, enabled
 * workflow whose trigger is Schedule fires on its cron (IST by default);
 * anything else has no schedule. Called after publish and enable/disable.
 */
export async function syncSchedule(
  workflowId: string,
  workspaceId: string
): Promise<string | null> {
  const boss = await getBoss();
  const { workflow, definition } = await tdb(
    async (tx) => {
      const [wf] = await tx
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.id, workflowId),
            eq(workflows.workspaceId, workspaceId)
          )
        )
        .limit(1);
      if (!wf?.publishedVersionId) {
        return { workflow: wf, definition: null };
      }
      const versionId = wf.publishedVersionId;
      const [version] = await tx
        .select({ definition: workflowVersions.definition })
        .from(workflowVersions)
        .where(eq(workflowVersions.id, versionId))
        .limit(1);
      return {
        workflow: wf,
        definition: (version?.definition as Definition | undefined) ?? null,
      };
    },
    { workspaceId }
  );
  const trigger = definition?.nodes.find((n) => n.type === "trigger");
  const config = trigger?.data.config ?? {};
  const cron =
    typeof config.scheduleCron === "string" ? config.scheduleCron.trim() : "";
  if (
    workflow?.enabled &&
    config.triggerType === "Schedule" &&
    CRON.test(cron)
  ) {
    const tz =
      typeof config.scheduleTimezone === "string" && config.scheduleTimezone
        ? config.scheduleTimezone
        : "Asia/Kolkata";
    await boss.schedule(
      QUEUES.schedules,
      cron,
      { workflowId, workspaceId } satisfies ScheduleJobData,
      {
        tz,
        key: workflowId,
      }
    );
    return cron;
  }
  await boss.unschedule(QUEUES.schedules, workflowId).catch(() => undefined);
  return null;
}

/** A cron tick: start a run of the published version (skipped and logged if disabled). */
export function fireSchedule(data: ScheduleJobData): Promise<void> {
  return runWithTenant({ workspaceId: data.workspaceId }, async () => {
    const [workflow] = await tdb((tx) =>
      tx
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.id, data.workflowId),
            eq(workflows.workspaceId, data.workspaceId)
          )
        )
        .limit(1)
    );
    if (!workflow) {
      return;
    }
    await startRun({
      workflow,
      trigger: "schedule",
      input: { firedAt: new Date().toISOString() },
      userId: workflow.userId,
    });
  });
}
