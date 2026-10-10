import "server-only";

import type { ReceiptV1 } from "@flowledger/ledger";
import { sql } from "drizzle-orm";
import type { Hex } from "viem";
import { db } from "@/lib/db";

export type PublicBatch = {
  root: Hex;
  chainBatchId: number | null;
  chainId: number;
  contract: Hex;
  txHash: Hex | null;
  blockNumber: string | null;
  status: string;
  confirmedAt: string | null;
  txUrl: string | null;
};

export type PublicReceipt = {
  executionId: string;
  version: number;
  receipt: ReceiptV1;
  receiptHash: Hex;
  status: "pending" | "anchored";
  createdAt: string;
  anchoredAt: string | null;
  leafIndex: number | null;
  proof: Hex[] | null;
  batch: PublicBatch | null;
  /** Simulated edits currently in place (demo tamper simulator). */
  tamperActive: boolean;
  chain: { receipt: ReceiptV1; hash: Hex }[];
  /** A keyless RPC the visitor's browser may call to read the contract. */
  publicRpcUrl: string | null;
};

type Row = {
  execution_id: string;
  version: number;
  receipt: ReceiptV1;
  receipt_hash: Hex;
  status: "pending" | "anchored";
  created_at: Date;
  anchored_at: Date | null;
  leaf_index: number | null;
  proof: Hex[] | null;
  merkle_root: Hex | null;
  chain_batch_id: number | null;
  chain_id: number | null;
  contract_address: Hex | null;
  tx_hash: Hex | null;
  block_number: string | null;
  batch_status: string | null;
  confirmed_at: Date | null;
  tamper_count: string | number;
};

const ID_PATTERN = /^[a-z0-9]{10,40}$/;
const TRAILING_SLASH = /\/$/;
const CHAIN_LENGTH = 5;

/** Public RPC for the browser. Never the server's CHAIN_RPC_URL on a real network (it may hold a key). */
export function publicRpcUrl(chainId: number | null): string | null {
  if (process.env.PUBLIC_CHAIN_RPC_URL) {
    return process.env.PUBLIC_CHAIN_RPC_URL;
  }
  if (chainId === 80_002) {
    return "https://polygon-amoy-bor-rpc.publicnode.com";
  }
  if (chainId === 31_337) {
    return process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545";
  }
  return null;
}

/** Everything the public verify page needs. No salt and no step data. */
export async function getPublicReceipt(
  executionId: string
): Promise<PublicReceipt | null> {
  if (!ID_PATTERN.test(executionId)) {
    return null;
  }
  const rows = (await db.execute(
    sql`select * from public_receipt(${executionId})`
  )) as unknown as Row[];
  const row = rows[0];
  if (!row) {
    return null;
  }
  const chainRows = (await db.execute(
    sql`select receipt, receipt_hash from public_receipt_chain(${executionId}, ${CHAIN_LENGTH})`
  )) as unknown as { receipt: ReceiptV1; receipt_hash: Hex }[];

  const explorer = process.env.EXPLORER_BASE_URL?.replace(TRAILING_SLASH, "");
  const batch: PublicBatch | null =
    row.merkle_root && row.chain_id && row.contract_address
      ? {
          root: row.merkle_root,
          chainBatchId: row.chain_batch_id,
          chainId: row.chain_id,
          contract: row.contract_address,
          txHash: row.tx_hash,
          blockNumber: row.block_number,
          status: row.batch_status ?? "building",
          confirmedAt: row.confirmed_at
            ? new Date(row.confirmed_at).toISOString()
            : null,
          txUrl:
            explorer && row.tx_hash && row.chain_id !== 31_337
              ? `${explorer}/tx/${row.tx_hash}`
              : null,
        }
      : null;

  return {
    executionId: row.execution_id,
    version: row.version,
    receipt: row.receipt,
    receiptHash: row.receipt_hash,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    anchoredAt: row.anchored_at
      ? new Date(row.anchored_at).toISOString()
      : null,
    leafIndex: row.leaf_index,
    proof: row.proof,
    batch,
    tamperActive: Number(row.tamper_count) > 0,
    chain: chainRows.map((r) => ({ receipt: r.receipt, hash: r.receipt_hash })),
    publicRpcUrl: publicRpcUrl(
      batch?.chainId ?? (Number(process.env.CHAIN_ID) || null)
    ),
  };
}
