import "server-only";

import { after } from "next/server";
import { anchorOnce } from "@/lib/ledger/anchorer";
import { getBoss } from "./boss";
import { isServerlessHive } from "./mode";
import { QUEUES, type RunJobData, type ScheduleJobData } from "./queues";
import { fireSchedule } from "./schedules";
import { handleDeadJob, handleRunJob } from "./worker";

/**
 * Serverless Hive (D-047). On Vercel there is no background process, so the
 * function that accepted a trigger keeps working after its response: it runs
 * pg-boss workers until the queues have been quiet for a moment, then anchors
 * the new receipts. Overlapping drains in one instance share the same workers.
 * pg-boss still owns claims, heartbeats, retries and dead letters.
 */
type DrainState = {
  drains: number;
  active: number;
  lastActivity: number;
  registered: Promise<void> | null;
  stopping: Promise<void> | null;
};

const globalForDrain = globalThis as unknown as { hiveDrain?: DrainState };

function state(): DrainState {
  globalForDrain.hiveDrain ??= {
    drains: 0,
    active: 0,
    lastActivity: Date.now(),
    registered: null,
    stopping: null,
  };
  return globalForDrain.hiveDrain;
}

async function tracked(work: () => Promise<void>): Promise<void> {
  const s = state();
  s.active += 1;
  s.lastActivity = Date.now();
  try {
    await work();
  } finally {
    s.active -= 1;
    s.lastActivity = Date.now();
  }
}

async function register(): Promise<void> {
  const boss = await getBoss();
  const concurrency = Number(process.env.HIVE_CONCURRENCY ?? 4);
  await boss.work<RunJobData>(
    QUEUES.runs,
    { localConcurrency: concurrency, pollingIntervalSeconds: 0.5 },
    async ([job]) => {
      if (job) {
        await tracked(() => handleRunJob(job.data));
      }
    }
  );
  await boss.work<RunJobData>(
    QUEUES.runsDead,
    { pollingIntervalSeconds: 1 },
    async ([job]) => {
      if (job) {
        await tracked(() => handleDeadJob(job.data));
      }
    }
  );
  await boss.work<ScheduleJobData>(
    QUEUES.schedules,
    { pollingIntervalSeconds: 1 },
    async ([job]) => {
      if (job) {
        await tracked(() => fireSchedule(job.data));
      }
    }
  );
}

async function unregister(): Promise<void> {
  const boss = await getBoss();
  for (const queue of [QUEUES.runs, QUEUES.runsDead, QUEUES.schedules]) {
    await boss.offWork(queue, { wait: true }).catch(() => undefined);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type DrainOptions = {
  /** Hard stop for picking up new jobs (in-flight jobs still finish). */
  budgetMs?: number;
  /** Keep working at least this long (lets cron checks and retries land). */
  minMs?: number;
  /** Stop after the queues have been quiet this long. */
  idleMs?: number;
  /** Also run pg-boss maintenance (expired/stale jobs, retention). */
  supervise?: boolean;
};

export async function drainHive(options: DrainOptions = {}): Promise<void> {
  const { budgetMs = 120_000, minMs = 0, idleMs = 3000 } = options;
  const s = state();
  const started = Date.now();
  if (s.stopping) {
    await s.stopping;
  }
  s.drains += 1;
  try {
    if (!s.registered) {
      s.lastActivity = Date.now();
      s.registered = register().catch((error: unknown) => {
        s.registered = null;
        throw error;
      });
    }
    await s.registered;
    if (options.supervise) {
      const boss = await getBoss();
      await boss
        .supervise()
        .catch((error: unknown) =>
          console.warn("[hive] maintenance pass failed:", error)
        );
    }
    while (Date.now() - started < budgetMs) {
      const quiet = s.active === 0 && Date.now() - s.lastActivity >= idleMs;
      if (quiet && Date.now() - started >= minMs) {
        break;
      }
      await sleep(250);
    }
  } finally {
    s.drains -= 1;
    if (s.drains === 0 && s.registered) {
      s.registered = null;
      s.stopping = unregister().finally(() => {
        s.stopping = null;
      });
      await s.stopping;
    }
  }
  if (process.env.ANCHORER_ENABLED !== "false") {
    await anchorPending();
  }
}

/** Anchor every pending receipt now (a couple of batches at most). */
async function anchorPending(): Promise<void> {
  for (let pass = 0; pass < 3; pass++) {
    try {
      const outcome = await anchorOnce();
      if (outcome.status === "confirmed") {
        console.info(
          `[ledger] batch ${outcome.batchId} anchored: ${outcome.leafCount} receipt(s), gas ${outcome.gasUsed}`
        );
        continue;
      }
      if (outcome.status === "failed") {
        console.error(
          `[ledger] batch ${outcome.batchId} failed: ${outcome.error}`
        );
      }
      return;
    } catch (error) {
      console.error("[ledger] anchor pass crashed:", error);
      return;
    }
  }
}

/**
 * After a trigger is queued: on serverless, keep this function alive to run it
 * (the in-process worker picks it up otherwise). Safe to call anywhere.
 */
export function kickHive(): void {
  if (!isServerlessHive()) {
    return;
  }
  try {
    after(() =>
      drainHive().catch((error: unknown) =>
        console.error("[hive] drain failed:", error)
      )
    );
  } catch {
    // Outside a request (scripts, nested after): the next tick picks it up.
  }
}
