import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  buildBatch,
  checkChain,
  checkInclusion,
  checkReceiptHash,
  checkStepData,
  jcs,
  leafHash,
  type ReceiptV1,
  receiptHash,
  saltedHash,
  verifyInclusion,
} from "./index";

const SALT = "0x000102030405060708090a0b0c0d0e0f" as Hex;

function receipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    v: 1,
    executionId: "ex1",
    workspace: `0x${"ab".repeat(32)}`,
    workflowId: "wf1",
    versionHash: `0x${"cd".repeat(32)}`,
    trigger: "form",
    status: "success",
    queuedAt: "2026-10-09T10:00:00.000Z",
    completedAt: "2026-10-09T10:00:03.000Z",
    steps: [
      {
        nodeId: "t1",
        action: "Form",
        status: "success",
        attempt: 1,
        inputHash: saltedHash(SALT, { name: "Asha" }),
        outputHash: saltedHash(SALT, { name: "Asha", track: "AI" }),
      },
      {
        nodeId: "s1",
        action: "Add Row to Sheet",
        status: "success",
        attempt: 2,
        inputHash: saltedHash(SALT, { rowValues: "Asha" }),
        outputHash: saltedHash(SALT, { rowNumber: 7 }),
      },
    ],
    prev: null,
    ...overrides,
  };
}

describe("canonical JSON and hashes", () => {
  it("is independent of key order", () => {
    expect(jcs({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(jcs({ a: [2, { c: 2, d: 1 }], b: 1 }));
    const r = receipt();
    const shuffled = JSON.parse(JSON.stringify({ ...r, steps: r.steps, v: 1 })) as ReceiptV1;
    expect(receiptHash(shuffled)).toBe(receiptHash(r));
  });

  it("salted hashes differ by salt and by data", () => {
    const other = "0xffffffffffffffffffffffffffffffff" as Hex;
    expect(saltedHash(SALT, { email: "a@b.test" })).not.toBe(saltedHash(other, { email: "a@b.test" }));
    expect(saltedHash(SALT, { email: "a@b.test" })).not.toBe(saltedHash(SALT, { email: "a@c.test" }));
    expect(saltedHash(SALT, undefined)).toBe(saltedHash(SALT, null));
  });

  it("leafHash matches the OpenZeppelin StandardMerkleTree leaf", () => {
    const h = receiptHash(receipt());
    const tree = StandardMerkleTree.of([[h]], ["bytes32"]);
    expect(leafHash(h)).toBe(tree.leafHash([h]));
  });
});

describe("Merkle batches", () => {
  const hashes = [1, 2, 3, 4, 5].map((n) => receiptHash(receipt({ executionId: `ex${n}` })));
  const batch = buildBatch(hashes);

  it("proves every receipt in input order", () => {
    hashes.forEach((h, i) => {
      expect(verifyInclusion(batch.root, h, batch.proofs[i] as Hex[])).toBe(true);
    });
  });

  it("rejects a changed receipt or a proof for another leaf", () => {
    const changed = receiptHash(receipt({ executionId: "ex3", status: "error" }));
    expect(checkInclusion(batch.root, changed, batch.proofs[2] as Hex[]).ok).toBe(false);
    expect(verifyInclusion(batch.root, hashes[0] as Hex, batch.proofs[1] as Hex[])).toBe(false);
  });

  it("works for a single-receipt batch", () => {
    const single = buildBatch([hashes[0] as Hex]);
    expect(verifyInclusion(single.root, hashes[0] as Hex, single.proofs[0] as Hex[])).toBe(true);
  });
});

describe("verification layers", () => {
  it("detects an edited receipt", () => {
    const r = receipt();
    const hash = receiptHash(r);
    expect(checkReceiptHash(r, hash).ok).toBe(true);
    expect(checkReceiptHash({ ...r, status: "error" }, hash).ok).toBe(false);
  });

  it("names the tampered step and part", () => {
    const r = receipt();
    const data = [
      { nodeId: "t1", input: { name: "Asha" }, output: { name: "Asha", track: "AI" } },
      { nodeId: "s1", input: { rowValues: "Asha" }, output: { rowNumber: 7 } },
    ];
    expect(checkStepData(r, SALT, data).ok).toBe(true);
    const tampered = checkStepData(r, SALT, [data[0], { ...data[1], output: { rowNumber: 8 } }] as typeof data);
    expect(tampered.ok).toBe(false);
    expect(tampered.failedStep).toEqual({ nodeId: "s1", action: "Add Row to Sheet", part: "output" });
    expect(tampered.detail).toContain("Add Row to Sheet");
  });

  it("walks the hash chain", () => {
    const first = receipt({ executionId: "a" });
    const firstHash = receiptHash(first);
    const second = receipt({ executionId: "b", prev: firstHash });
    const secondHash = receiptHash(second);
    const third = receipt({ executionId: "c", prev: secondHash });
    const chain = [
      { receipt: third, hash: receiptHash(third) },
      { receipt: second, hash: secondHash },
      { receipt: first, hash: firstHash },
    ];
    expect(checkChain(chain).ok).toBe(true);
    expect(checkChain([chain[0], chain[2]] as typeof chain).ok).toBe(false);
  });
});
