import "server-only";

import type { StepData } from "@flowledger/ledger";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { receipts, tamperEvents, workflowExecutionLogs } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { sealForWorkspace } from "@/lib/vault";
import { finalRows, fullOutput } from "./receipts";

/**
 * Layer 3 data for the owner: the salt and the stored step data, exactly as
 * the receipt hashed them. Runs in the caller's tenant context (RLS).
 */
export async function integrityData(
  workspaceId: string,
  executionId: string
): Promise<{ salt: string; steps: StepData[] } | null> {
  const [receipt] = await tdb((tx) =>
    tx
      .select({ salt: receipts.salt })
      .from(receipts)
      .where(
        and(
          eq(receipts.executionId, executionId),
          eq(receipts.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(receipts.version))
      .limit(1)
  );
  if (!receipt?.salt) {
    return null;
  }
  const logs = await tdb((tx) =>
    tx
      .select()
      .from(workflowExecutionLogs)
      .where(eq(workflowExecutionLogs.executionId, executionId))
      .orderBy(asc(workflowExecutionLogs.startedAt))
  );
  const steps: StepData[] = [];
  for (const row of finalRows(logs)) {
    steps.push({
      nodeId: row.nodeId,
      input: row.input ?? null,
      output: await fullOutput(workspaceId, row),
    });
  }
  return { salt: receipt.salt, steps };
}

type Scope = [string[], Record<string, unknown>];
type Edit = { path: string[]; next: unknown };

const EMAIL_LOCAL_PART = /^[^@]+/;

/** A visible edit for one value: numbers +1, emails re-addressed, text marked. */
function editFor(key: string, value: unknown, strict: boolean): unknown {
  if (typeof value === "number" && strict) {
    return value + 1;
  }
  if (typeof value === "string" && strict && value.includes("@")) {
    return value.replace(EMAIL_LOCAL_PART, "attacker");
  }
  if (typeof value === "string" && !strict && key !== "model") {
    return `${value} (edited)`;
  }
  return;
}

/** Pick the field the simulator edits: a row number, an email, or the first value. */
function tamperTarget(output: unknown): Edit | null {
  if (!output || typeof output !== "object") {
    return null;
  }
  const record = output as Record<string, unknown>;
  const scopes: Scope[] =
    record.data && typeof record.data === "object"
      ? [
          [["data"], record.data as Record<string, unknown>],
          [[], record],
        ]
      : [[[], record]];
  // First pass: numbers and emails (clearly visible); second: any text.
  for (const strict of [true, false]) {
    for (const [prefix, scope] of scopes) {
      for (const [key, value] of Object.entries(scope)) {
        const next = editFor(key, value, strict);
        if (next !== undefined) {
          return { path: [...prefix, key], next };
        }
      }
    }
  }
  return null;
}

function setPath(
  target: Record<string, unknown>,
  path: string[],
  value: unknown
) {
  let cursor: Record<string, unknown> = target;
  for (const key of path.slice(0, -1)) {
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path.at(-1) as string] = value;
}

/**
 * Demo tamper simulator (docs/08): silently edit one stored step output the way
 * an insider with database access could, and record that it happened.
 */
export async function simulateTamper(
  workspaceId: string,
  executionId: string,
  actorUserId: string
): Promise<{ nodeId: string; field: string } | null> {
  const logs = await tdb((tx) =>
    tx
      .select()
      .from(workflowExecutionLogs)
      .where(eq(workflowExecutionLogs.executionId, executionId))
      .orderBy(asc(workflowExecutionLogs.startedAt))
  );
  // Prefer an action step (not the trigger) whose output has something to change.
  const candidates = finalRows(logs).filter((r) => r.status === "success");
  const ordered = [
    ...candidates.filter((r) => r.nodeType !== "trigger"),
    ...candidates.filter((r) => r.nodeType === "trigger"),
  ];
  for (const row of ordered) {
    const output = await fullOutput(workspaceId, row);
    const target = tamperTarget(output);
    if (!target) {
      continue;
    }
    const edited = structuredClone(output) as Record<string, unknown>;
    setPath(edited, target.path, target.next);
    await tdb(async (tx) => {
      await tx.insert(tamperEvents).values({
        workspaceId,
        executionId,
        logId: row.id,
        nodeId: row.nodeId,
        field: target.path.join("."),
        originalOutputEnc: row.outputEnc,
        originalOutput: row.output,
        actorUserId,
      });
      await tx
        .update(workflowExecutionLogs)
        .set({
          outputEnc: row.outputEnc
            ? await sealForWorkspace(workspaceId, JSON.stringify(edited))
            : null,
          output: row.outputEnc ? row.output : edited,
        })
        .where(eq(workflowExecutionLogs.id, row.id));
    });
    return { nodeId: row.nodeId, field: target.path.join(".") };
  }
  return null;
}

/** Put every simulated edit on this run back exactly as it was. */
export async function restoreTamper(
  workspaceId: string,
  executionId: string
): Promise<number> {
  return await tdb(async (tx) => {
    const events = await tx
      .select()
      .from(tamperEvents)
      .where(
        and(
          eq(tamperEvents.executionId, executionId),
          eq(tamperEvents.workspaceId, workspaceId),
          isNull(tamperEvents.restoredAt)
        )
      )
      .orderBy(desc(tamperEvents.at));
    for (const event of events) {
      await tx
        .update(workflowExecutionLogs)
        .set({
          outputEnc: event.originalOutputEnc,
          output: event.originalOutput,
        })
        .where(eq(workflowExecutionLogs.id, event.logId));
      await tx
        .update(tamperEvents)
        .set({ restoredAt: new Date() })
        .where(eq(tamperEvents.id, event.id));
    }
    return events.length;
  });
}
