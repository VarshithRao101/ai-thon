import "server-only";

import { after } from "next/server";
import { drainHive } from "./drain";
import { isServerlessHive } from "./mode";

/**
 * Self-ticking (D-054). On serverless, retries, durable delays and schedule
 * ticks need a periodic pass (/api/hive/tick). If no cron is set up, or it
 * misfires, busy pages (dashboard polling, an open canvas) run that same pass
 * in the background at most once a minute per instance, so work keeps moving.
 */
const MIN_GAP_MS = 60_000;
const globalForTick = globalThis as unknown as { hiveLastTick?: number };

export function markTicked(): void {
  globalForTick.hiveLastTick = Date.now();
}

export function opportunisticTick(): void {
  if (!isServerlessHive()) {
    return;
  }
  const last = globalForTick.hiveLastTick ?? 0;
  if (Date.now() - last < MIN_GAP_MS) {
    return;
  }
  markTicked();
  try {
    after(() =>
      drainHive({
        supervise: true,
        minMs: 6000,
        idleMs: 2000,
        budgetMs: 40_000,
      }).catch((error: unknown) =>
        console.error("[hive] self-tick failed:", error)
      )
    );
  } catch {
    // Outside a request: nothing to do.
  }
}
