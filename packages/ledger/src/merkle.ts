import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import type { Hex } from "viem";

const LEAF_ENCODING = ["bytes32"];

export type Batch = {
  root: Hex;
  /** proofs[i] proves hashes[i] (input order). */
  proofs: Hex[][];
};

/** Build a StandardMerkleTree over receipt hashes (double-hashed bytes32 leaves). */
export function buildBatch(hashes: Hex[]): Batch {
  if (hashes.length === 0) {
    throw new Error("A batch needs at least one receipt");
  }
  const tree = StandardMerkleTree.of(
    hashes.map((h) => [h]),
    LEAF_ENCODING
  );
  return {
    root: tree.root as Hex,
    proofs: hashes.map((_, i) => tree.getProof(i) as Hex[]),
  };
}

/** True if `hash` is in the tree with this root. Runs in the browser. */
export function verifyInclusion(root: Hex, hash: Hex, proof: Hex[]): boolean {
  try {
    return StandardMerkleTree.verify(root, LEAF_ENCODING, [hash], proof);
  } catch {
    return false;
  }
}
