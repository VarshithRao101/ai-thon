import "server-only";

import { buildBatch } from "@flowledger/ledger";
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { decodeEventLog, type Hex } from "viem";
import { adminDb } from "@/lib/db/admin";
import { ledgerBatches, receipts } from "@/lib/db/schema";
import { chainConfig, clients } from "./chain";

const MAX_BATCH = 1000;
const LOCK_KEY = 4_242_017; // pg advisory lock id for "one batch builder at a time"

export type AnchorOutcome =
  | { status: "idle" }
  | { status: "disabled"; missing: string[] }
  | {
      status: "confirmed";
      batchId: number;
      chainBatchId: number;
      leafCount: number;
      txHash: Hex;
      gasUsed: bigint;
    }
  | { status: "failed"; batchId: number; error: string };

/**
 * One anchoring pass (docs/08 "Anchorer job"): claim pending receipts, build
 * a Merkle batch, send anchor(root, leafCount), wait for confirmation, then
 * mark the receipts anchored. Runs are never blocked by any of this.
 */
export async function anchorOnce(): Promise<AnchorOutcome> {
  const chain = chainConfig();
  if (!chain.ok) {
    return { status: "disabled", missing: chain.missing };
  }
  const { config } = chain;
  const db = adminDb();

  await releaseStaleBatches();

  // 1–2. Claim receipts and store their proofs in one transaction.
  const claimed = await db.transaction(async (tx) => {
    const [{ locked } = { locked: false }] = (await tx.execute(
      sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`
    )) as unknown as { locked: boolean }[];
    if (!locked) {
      return null;
    }
    const pending = await tx
      .select({ id: receipts.id, hash: receipts.receiptHash })
      .from(receipts)
      .where(and(eq(receipts.status, "pending"), isNull(receipts.batchId)))
      .orderBy(asc(receipts.createdAt))
      .limit(MAX_BATCH);
    if (pending.length === 0) {
      return null;
    }
    const batch = buildBatch(pending.map((r) => r.hash as Hex));
    const [row] = await tx
      .insert(ledgerBatches)
      .values({
        merkleRoot: batch.root,
        leafCount: pending.length,
        chainId: config.chainId,
        contractAddress: config.contract,
        status: "building",
      })
      .returning({ id: ledgerBatches.id });
    if (!row) {
      throw new Error("Could not create the batch");
    }
    for (const [index, receipt] of pending.entries()) {
      await tx
        .update(receipts)
        .set({ batchId: row.id, leafIndex: index, proof: batch.proofs[index] })
        .where(eq(receipts.id, receipt.id));
    }
    return { batchId: row.id, root: batch.root, leafCount: pending.length };
  });
  if (!claimed) {
    return { status: "idle" };
  }

  // 3–4. Send the transaction and wait for it.
  const { publicClient, walletClient, account, abi } = clients(config);
  try {
    const txHash = await walletClient.writeContract({
      address: config.contract,
      abi,
      functionName: "anchor",
      args: [claimed.root, claimed.leafCount],
      account,
      chain: walletClient.chain,
    });
    await db
      .update(ledgerBatches)
      .set({ status: "submitted", txHash })
      .where(eq(ledgerBatches.id, claimed.batchId));

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: config.chainId === 31_337 ? 1 : 2,
      timeout: 120_000,
    });
    if (receipt.status !== "success") {
      throw new Error(`anchor() reverted in tx ${txHash}`);
    }
    let chainBatchId: number | null = null;
    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({
          abi,
          data: log.data,
          topics: log.topics,
        });
        if (event.eventName === "BatchAnchored") {
          chainBatchId = Number(event.args.batchId);
        }
      } catch {
        // not our event
      }
    }
    if (chainBatchId === null) {
      throw new Error("BatchAnchored event not found in the receipt");
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(ledgerBatches)
        .set({
          status: "confirmed",
          chainBatchId,
          blockNumber: receipt.blockNumber.toString(),
          gasUsed: receipt.gasUsed.toString(),
          confirmedAt: now,
        })
        .where(eq(ledgerBatches.id, claimed.batchId));
      await tx
        .update(receipts)
        .set({ status: "anchored", anchoredAt: now })
        .where(eq(receipts.batchId, claimed.batchId));
    });
    return {
      status: "confirmed",
      batchId: claimed.batchId,
      chainBatchId,
      leafCount: claimed.leafCount,
      txHash,
      gasUsed: receipt.gasUsed,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? (error.message.split("\n")[0] ?? "error")
        : String(error);
    await failBatch(claimed.batchId, message);
    return { status: "failed", batchId: claimed.batchId, error: message };
  }
}

/** Mark a batch failed and release its receipts for the next pass. */
async function failBatch(batchId: number, error: string) {
  const db = adminDb();
  await db.transaction(async (tx) => {
    await tx
      .update(ledgerBatches)
      .set({ status: "failed", error: error.slice(0, 500) })
      .where(eq(ledgerBatches.id, batchId));
    await tx
      .update(receipts)
      .set({ batchId: null, leafIndex: null, proof: null })
      .where(
        and(eq(receipts.batchId, batchId), eq(receipts.status, "pending"))
      );
  });
}

/** A crash between claiming and sending leaves "building" batches: release them. */
async function releaseStaleBatches() {
  const db = adminDb();
  const stale = await db
    .select({ id: ledgerBatches.id })
    .from(ledgerBatches)
    .where(
      and(
        inArray(ledgerBatches.status, ["building"]),
        isNull(ledgerBatches.txHash),
        lt(ledgerBatches.createdAt, new Date(Date.now() - 2 * 60_000))
      )
    );
  for (const batch of stale) {
    await failBatch(batch.id, "Released: the anchorer stopped before sending");
  }
}

const globalForAnchorer = globalThis as unknown as {
  anchorer?: NodeJS.Timeout;
  anchorerWarned?: boolean;
};

/** Anchor on an interval (30 s demo default). Idempotent per process. */
export function startAnchorer(): void {
  if (globalForAnchorer.anchorer) {
    return;
  }
  const interval = Math.max(
    5000,
    Number(process.env.ANCHOR_INTERVAL_MS ?? 30_000)
  );
  let running = false;
  const tick = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const outcome = await anchorOnce();
      if (outcome.status === "disabled") {
        if (!globalForAnchorer.anchorerWarned) {
          console.warn(
            `[ledger] anchoring is off until these are set: ${outcome.missing.join(", ")}`
          );
          globalForAnchorer.anchorerWarned = true;
        }
      } else if (outcome.status === "confirmed") {
        console.info(
          `[ledger] batch ${outcome.batchId} anchored: ${outcome.leafCount} receipt(s), chain batch ${outcome.chainBatchId}, gas ${outcome.gasUsed}`
        );
      } else if (outcome.status === "failed") {
        console.error(
          `[ledger] batch ${outcome.batchId} failed: ${outcome.error}`
        );
      }
    } catch (error) {
      console.error("[ledger] anchor pass crashed:", error);
    } finally {
      running = false;
    }
  };
  // tick() never rejects: it catches and logs every failure itself.
  const run = () => {
    tick().catch(() => undefined);
  };
  globalForAnchorer.anchorer = setInterval(run, interval);
  setTimeout(run, 3000);
  console.info(
    `[ledger] anchorer started (every ${Math.round(interval / 1000)} s)`
  );
}
