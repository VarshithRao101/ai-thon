import "server-only";

import { EventEmitter } from "node:events";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { db } from "@/lib/db";

/**
 * Live run events (docs/07 "Events"). Workers publish with pg_notify, and every
 * web process LISTENs once and fans out to its SSE subscribers, so this works
 * whether the worker runs in-process (demo) or as separate containers.
 * Payloads carry ids and statuses only, never step data.
 */
export type HiveEvent = {
  workspaceId: string;
  /** Lets a canvas follow every run of its workflow, whatever triggered it. */
  workflowId?: string;
  executionId: string;
  kind: "run" | "step";
  status: string;
  nodeId?: string;
  attempt?: number;
  at: number;
};

const CHANNEL = "hive_events";

export async function publishEvent(
  event: Omit<HiveEvent, "at">
): Promise<void> {
  const payload = JSON.stringify({ ...event, at: Date.now() });
  try {
    await db.execute(sql`select pg_notify(${CHANNEL}, ${payload})`);
  } catch (error) {
    // Events are best-effort: the run itself is already persisted.
    console.warn("[hive] could not publish event:", error);
  }
}

const globalForEvents = globalThis as unknown as {
  hiveEvents?: { emitter: EventEmitter; ready: Promise<void> };
};

function bus() {
  if (!globalForEvents.hiveEvents) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    const listener = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
    const ready = listener
      .listen(CHANNEL, (payload) => {
        try {
          const event = JSON.parse(payload) as HiveEvent;
          emitter.emit(event.executionId, event);
          emitter.emit(`ws:${event.workspaceId}`, event);
        } catch {
          // ignore malformed payloads
        }
      })
      .then(() => undefined);
    globalForEvents.hiveEvents = { emitter, ready };
  }
  return globalForEvents.hiveEvents;
}

/** Subscribe to one run's events, or a workspace feed with `ws:<id>`. */
export async function subscribe(
  key: string,
  onEvent: (event: HiveEvent) => void
): Promise<() => void> {
  const { emitter, ready } = bus();
  await ready;
  emitter.on(key, onEvent);
  return () => emitter.off(key, onEvent);
}
