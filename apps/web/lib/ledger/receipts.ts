import "server-only";

import { createHmac } from "node:crypto";
import {
  definitionHash,
  newSalt,
  type ReceiptStep,
  type ReceiptV1,
  receiptHash,
  saltedHash,
  workspacePseudonym,
} from "@flowledger/ledger";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Hex } from "viem";
import {
  receipts,
  workflowExecutionLogs,
  workflowExecutions,
  workflowVersions,
} from "@/lib/db/schema";
import { runWithTenant, tdb } from "@/lib/db/tenant";
import { openForWorkspace } from "@/lib/vault";

type LogRow = typeof workflowExecutionLogs.$inferSelect;

/** Server pepper for workspace pseudonyms, derived so no new secret is needed. */
function pepper(): string {
  return createHmac(
    "sha256",
    process.env.BETTER_AUTH_SECRET ?? "flowledger-dev"
  )
    .update("flowledger:receipt-pepper:v1")
    .digest("hex");
}

/** The latest row per node decides what the run did (earlier rows are retries). */
export function finalRows(logs: LogRow[]): LogRow[] {
  const latest = new Map<string, LogRow>();
  for (const row of logs) {
    latest.set(row.nodeId, row);
  }
  return [...latest.values()];
}

/** Full step output: the sealed copy when present, else the stored preview. */
export async function fullOutput(
  workspaceId: string,
  row: LogRow
): Promise<unknown> {
  if (row.outputEnc) {
    return JSON.parse(await openForWorkspace(workspaceId, row.outputEnc));
  }
  return row.output ?? null;
}

/**
 * Issue a receipt for a run that reached a final state (docs/08 "Receipt v1").
 * Steps carry salted hashes of exactly what the database holds, so the owner
 * can later re-hash the stored data and detect any silent edit.
 */
export function issueReceipt(
  executionId: string,
  workspaceId: string
): Promise<string | null> {
  return runWithTenant({ workspaceId }, async () => {
    const [execution] = await tdb((tx) =>
      tx
        .select()
        .from(workflowExecutions)
        .where(
          and(
            eq(workflowExecutions.id, executionId),
            eq(workflowExecutions.workspaceId, workspaceId)
          )
        )
        .limit(1)
    );
    if (
      !(
        execution &&
        ["success", "error", "cancelled"].includes(execution.status)
      )
    ) {
      return null;
    }

    let versionHash: Hex;
    if (execution.versionId) {
      const versionId = execution.versionId;
      const [version] = await tdb((tx) =>
        tx
          .select({ hash: workflowVersions.definitionHash })
          .from(workflowVersions)
          .where(eq(workflowVersions.id, versionId))
          .limit(1)
      );
      versionHash = (version?.hash ?? definitionHash(null)) as Hex;
    } else {
      versionHash = definitionHash(execution.definition ?? null);
    }

    const logs = await tdb((tx) =>
      tx
        .select()
        .from(workflowExecutionLogs)
        .where(eq(workflowExecutionLogs.executionId, executionId))
        .orderBy(asc(workflowExecutionLogs.startedAt))
    );
    const salt = newSalt();
    const steps: ReceiptStep[] = [];
    for (const row of finalRows(logs)) {
      steps.push({
        nodeId: row.nodeId,
        action: row.nodeName,
        status: row.status,
        attempt: row.attempt,
        inputHash: saltedHash(salt, row.input ?? null),
        outputHash: saltedHash(salt, await fullOutput(workspaceId, row)),
      });
    }

    return tdb(async (tx) => {
      // Serialise receipts per workspace so the hash chain never forks.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`receipts:${workspaceId}`}))`
      );
      const [previous] = await tx
        .select({ hash: receipts.receiptHash })
        .from(receipts)
        .where(eq(receipts.workspaceId, workspaceId))
        .orderBy(desc(receipts.createdAt))
        .limit(1);
      const [latestVersion] = await tx
        .select({ version: receipts.version })
        .from(receipts)
        .where(eq(receipts.executionId, executionId))
        .orderBy(desc(receipts.version))
        .limit(1);

      const receipt: ReceiptV1 = {
        v: 1,
        executionId,
        workspace: workspacePseudonym(pepper(), workspaceId),
        workflowId: execution.workflowId,
        versionHash,
        trigger: execution.trigger,
        status: execution.status,
        queuedAt: execution.queuedAt.toISOString(),
        completedAt: (execution.completedAt ?? new Date()).toISOString(),
        steps,
        prev: (previous?.hash as Hex | undefined) ?? null,
      };
      const hash = receiptHash(receipt);
      await tx.insert(receipts).values({
        workspaceId,
        executionId,
        version: (latestVersion?.version ?? 0) + 1,
        receipt,
        receiptHash: hash,
        salt,
        prevReceiptHash: receipt.prev,
      });
      return hash;
    });
  });
}
