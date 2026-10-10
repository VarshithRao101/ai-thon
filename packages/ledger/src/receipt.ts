import canonicalize from "canonicalize";
import {
  bytesToHex,
  concat,
  encodeAbiParameters,
  type Hex,
  hexToBytes,
  keccak256,
  sha256,
  stringToBytes,
} from "viem";

/**
 * Receipt v1 (docs/08). Stored off-chain; only Merkle roots of receipt hashes
 * go on-chain. Contains ids and salted hashes only, never personal data.
 */
export type ReceiptStep = {
  nodeId: string;
  action: string;
  status: string;
  attempt: number;
  inputHash: Hex;
  outputHash: Hex;
};

export type ReceiptV1 = {
  v: 1;
  executionId: string;
  /** sha256(pepper ‖ workspaceId): links runs of one workspace without naming it. */
  workspace: Hex;
  workflowId: string;
  /** sha256 of the canonical published definition (or the draft snapshot for test runs). */
  versionHash: Hex;
  trigger: string;
  status: string;
  queuedAt: string;
  completedAt: string;
  steps: ReceiptStep[];
  /** receiptHash of the previous receipt in this workspace (hash chain). */
  prev: Hex | null;
};

/** RFC 8785 canonical JSON. `undefined` is normalised to null. */
export function jcs(value: unknown): string {
  const text = canonicalize(value === undefined ? null : value);
  if (text === undefined) {
    throw new Error("Value cannot be canonicalised");
  }
  return text;
}

/** A fresh 16-byte salt per execution. Deleting it crypto-shreds the link. */
export function newSalt(): Hex {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/** sha256(salt ‖ utf8(JCS(data))): low-entropy data (an email) cannot be brute-forced. */
export function saltedHash(salt: Hex, data: unknown): Hex {
  return sha256(concat([hexToBytes(salt), stringToBytes(jcs(data))]));
}

/** keccak256 of the receipt's canonical JSON. */
export function receiptHash(receipt: ReceiptV1): Hex {
  return keccak256(stringToBytes(jcs(receipt)));
}

/**
 * The OpenZeppelin StandardMerkleTree leaf for a receipt hash:
 * keccak256(bytes.concat(keccak256(abi.encode(bytes32)))). Matches
 * FlowLedgerAnchor.verifyReceipt and prevents second-preimage attacks.
 */
export function leafHash(hash: Hex): Hex {
  return keccak256(keccak256(encodeAbiParameters([{ type: "bytes32" }], [hash])));
}

/** sha256(pepper ‖ workspaceId) as the receipt's workspace pseudonym. */
export function workspacePseudonym(pepper: string, workspaceId: string): Hex {
  return sha256(stringToBytes(`${pepper}\u0000${workspaceId}`));
}

/** sha256 of a definition's canonical JSON (matches lib/hive/definition.ts). */
export function definitionHash(definition: unknown): Hex {
  return sha256(stringToBytes(jcs(definition)));
}
