import "server-only";

import { and, eq, notInArray } from "drizzle-orm";
import { workflowExecutions } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { startAnchorer } from "@/lib/ledger/anchorer";
import { issueReceipt } from "@/lib/ledger/receipts";
import { getBoss } from "./boss";
import { publishEvent } from "./events";
import { enqueueRun } from "./ingress";
import { QUEUES, type RunJobData, type ScheduleJobData } from "./queues";
import { runExecution } from "./runner";
import { fireSchedule } from "./schedules";

type SettledHook = (job: RunJobData, status: string) => Promise<void>;
const settledHooks: SettledHook[] = [
  // Proof-of-Execution: every final run gets a receipt (docs/08).
  async (job) => {
    await issueReceipt(job.executionId, job.workspaceId);
  },
];

/** Called once per run that reaches a final state (the ledger issues receipts here). */
export function onRunSettled(hook: SettledHook): void {
  settledHooks.push(hook);
}

const globalForWorker = globalThis as unknown as { hiveWorker?: Promise<void> };

/**
 * Start consuming the Hive queues in this process. Idempotent: Next.js may call
 * instrumentation more than once in dev.
 */
export function startHiveWorker(): Promise<void> {
  globalForWorker.hiveWorker ??= (async () => {
    const boss = await getBoss();
    const concurrency = Number(process.env.HIVE_CONCURRENCY ?? 4);

    await boss.work<RunJobData>(
      QUEUES.runs,
      { localConcurrency: concurrency, pollingIntervalSeconds: 0.5 },
      async ([job]) => {
        if (!job) {
          return;
        }
        const outcome = await runExecution(job.data);
        if (!outcome) {
          return;
        }
        if (outcome.status === "waiting") {
          // Durable timer: no worker sleeps; a delayed job resumes the run.
          await enqueueRun({ ...job.data, resume: true }, outcome.resumeAt);
          return;
        }
        for (const hook of settledHooks) {
          await hook(job.data, outcome.status).catch((error: unknown) =>
            console.error("[hive] settled hook failed:", error)
          );
        }
      }
    );

    // Dead letters: the run failed every infrastructure retry.
    await boss.work<RunJobData>(
      QUEUES.runsDead,
      { pollingIntervalSeconds: 2 },
      async ([job]) => {
        if (!job) {
          return;
        }
        const { executionId, workspaceId } = job.data;
        await tdb(
          (tx) =>
            tx
              .update(workflowExecutions)
              .set({
                status: "error",
                error:
                  "The run failed repeatedly due to infrastructure errors (dead-lettered)",
                completedAt: new Date(),
              })
              .where(
                and(
                  eq(workflowExecutions.id, executionId),
                  notInArray(workflowExecutions.status, [
                    "success",
                    "error",
                    "cancelled",
                    "skipped",
                  ])
                )
              ),
          { workspaceId }
        );
        await publishEvent({
          workspaceId,
          executionId,
          kind: "run",
          status: "error",
        });
      }
    );

    // Schedule triggers: pg-boss creates one job per cron tick.
    await boss.work<ScheduleJobData>(
      QUEUES.schedules,
      { pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (job) {
          await fireSchedule(job.data);
        }
      }
    );

    console.info(`[hive] worker started (concurrency ${concurrency})`);
    if (process.env.ANCHORER_ENABLED !== "false") {
      startAnchorer();
    }
  })().catch((error) => {
    globalForWorker.hiveWorker = undefined;
    throw error;
  });
  return globalForWorker.hiveWorker;
}
