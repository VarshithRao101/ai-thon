import type { Hex } from "viem";
import { verifyInclusion } from "./merkle";
import { type ReceiptV1, receiptHash, saltedHash } from "./receipt";

/**
 * Verification layers (docs/08 "Verification layers"). Every function here is
 * pure, so the public verify page runs them in the visitor's browser.
 */

export type CheckResult = { ok: boolean; detail: string };

/** Layer 0: the receipt JSON we were given hashes to the claimed receipt hash. */
export function checkReceiptHash(receipt: ReceiptV1, claimed: Hex): CheckResult {
  const actual = receiptHash(receipt);
  return actual === claimed
    ? { ok: true, detail: "The receipt hashes to its recorded fingerprint" }
    : { ok: false, detail: "The receipt was changed: its hash no longer matches" };
}

/** Layer 1: the receipt hash is a leaf of the batch's Merkle root. */
export function checkInclusion(root: Hex, hash: Hex, proof: Hex[]): CheckResult {
  return verifyInclusion(root, hash, proof)
    ? { ok: true, detail: `Included in batch root ${root.slice(0, 10)}…` }
    : { ok: false, detail: "The Merkle proof does not lead to the batch root" };
}

/** Layer 2: the root read from the chain equals the batch root. */
export function checkAnchor(expectedRoot: Hex, onChainRoot: Hex | null | undefined): CheckResult {
  if (!onChainRoot) {
    return { ok: false, detail: "No such batch on-chain" };
  }
  return onChainRoot.toLowerCase() === expectedRoot.toLowerCase()
    ? { ok: true, detail: "The same root is committed on-chain" }
    : { ok: false, detail: "The on-chain root differs" };
}

export type StepData = { nodeId: string; input: unknown; output: unknown };

export type IntegrityResult = CheckResult & {
  /** The first step whose stored data no longer matches the receipt. */
  failedStep?: { nodeId: string; action: string; part: "input" | "output" };
};

/** Layer 3 (owner only): stored step data re-hashes to the receipt's step hashes. */
export function checkStepData(receipt: ReceiptV1, salt: Hex, data: StepData[]): IntegrityResult {
  const byNode = new Map(data.map((d) => [d.nodeId, d]));
  for (const step of receipt.steps) {
    const stored = byNode.get(step.nodeId);
    if (!stored) {
      return {
        ok: false,
        detail: `Step "${step.action}" is missing from the stored run`,
        failedStep: { nodeId: step.nodeId, action: step.action, part: "output" },
      };
    }
    if (saltedHash(salt, stored.input) !== step.inputHash) {
      return {
        ok: false,
        detail: `Tampered: step "${step.action}" input changed after it was recorded`,
        failedStep: { nodeId: step.nodeId, action: step.action, part: "input" },
      };
    }
    if (saltedHash(salt, stored.output) !== step.outputHash) {
      return {
        ok: false,
        detail: `Tampered: step "${step.action}" output changed after it was recorded`,
        failedStep: { nodeId: step.nodeId, action: step.action, part: "output" },
      };
    }
  }
  return { ok: true, detail: `All ${receipt.steps.length} steps match their recorded hashes` };
}

/** Layer 4: each receipt points at the previous one (newest first). */
export function checkChain(receipts: { receipt: ReceiptV1; hash: Hex }[]): CheckResult {
  for (let i = 0; i < receipts.length - 1; i++) {
    const current = receipts[i];
    const previous = receipts[i + 1];
    if (current && previous && current.receipt.prev !== previous.hash) {
      return { ok: false, detail: "A run is missing or out of order in this workspace's chain" };
    }
  }
  return { ok: true, detail: `The last ${receipts.length} receipts link without gaps` };
}
