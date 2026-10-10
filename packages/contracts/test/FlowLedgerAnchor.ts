import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anyValue } from "@nomicfoundation/hardhat-viem-assertions/predicates";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { network } from "hardhat";
import { keccak256, toHex, zeroHash } from "viem";

const receipt = (n: number) => keccak256(toHex(`receipt-${n}`));

describe("FlowLedgerAnchor", async () => {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [admin, anchorer, outsider] = await viem.getWalletClients();

  async function deploy() {
    return viem.deployContract("FlowLedgerAnchor", [admin.account.address, anchorer.account.address]);
  }

  function tree(hashes: `0x${string}`[]) {
    return StandardMerkleTree.of(
      hashes.map((h) => [h]),
      ["bytes32"]
    );
  }

  it("anchors a root, emits BatchAnchored and stores it", async () => {
    const anchor = await deploy();
    const t = tree([receipt(1), receipt(2), receipt(3)]);
    const root = t.root as `0x${string}`;
    await viem.assertions.emitWithArgs(
      anchor.write.anchor([root, 3], { account: anchorer.account }),
      anchor,
      "BatchAnchored",
      [0n, root, 3, anyValue]
    );
    assert.equal(await anchor.read.batchCount(), 1n);
    const stored = await anchor.read.batch([0n]);
    assert.equal(stored.root, root);
    assert.equal(stored.leafCount, 3);
  });

  it("only the anchorer can anchor", async () => {
    const anchor = await deploy();
    await viem.assertions.revertWithCustomError(
      anchor.write.anchor([receipt(1), 1], { account: outsider.account }),
      anchor,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("rejects an empty batch", async () => {
    const anchor = await deploy();
    await viem.assertions.revertWithCustomError(
      anchor.write.anchor([zeroHash, 1], { account: anchorer.account }),
      anchor,
      "EmptyBatch"
    );
    await viem.assertions.revertWithCustomError(
      anchor.write.anchor([receipt(1), 0], { account: anchorer.account }),
      anchor,
      "EmptyBatch"
    );
  });

  it("admin can pause; paused contract refuses to anchor", async () => {
    const anchor = await deploy();
    await viem.assertions.revertWithCustomError(
      anchor.write.pause({ account: outsider.account }),
      anchor,
      "AccessControlUnauthorizedAccount"
    );
    await anchor.write.pause({ account: admin.account });
    await viem.assertions.revertWithCustomError(
      anchor.write.anchor([receipt(1), 1], { account: anchorer.account }),
      anchor,
      "EnforcedPause"
    );
    await anchor.write.unpause({ account: admin.account });
    await anchor.write.anchor([receipt(1), 1], { account: anchorer.account });
    assert.equal(await anchor.read.batchCount(), 1n);
  });

  it("verifies an OpenZeppelin proof made off-chain, and rejects tampering", async () => {
    const anchor = await deploy();
    const hashes = [receipt(1), receipt(2), receipt(3), receipt(4), receipt(5)];
    const t = tree(hashes);
    await anchor.write.anchor([t.root as `0x${string}`, hashes.length], { account: anchorer.account });
    await anchor.write.anchor([tree([receipt(9)]).root as `0x${string}`, 1], { account: anchorer.account });

    const proof = t.getProof(2) as `0x${string}`[];
    assert.equal(await anchor.read.verifyReceipt([0n, receipt(3), proof]), true);
    assert.equal(await anchor.read.verifyReceipt([0n, receipt(6), proof]), false, "modified receipt hash");
    assert.equal(await anchor.read.verifyReceipt([1n, receipt(3), proof]), false, "wrong batch");
    await viem.assertions.revertWithCustomError(
      anchor.read.verifyReceipt([7n, receipt(3), proof]),
      anchor,
      "UnknownBatch"
    );
  });

  it("measures anchor() gas", async () => {
    const anchor = await deploy();
    const hash = await anchor.write.anchor([receipt(1), 250], { account: anchorer.account });
    const { gasUsed } = await publicClient.waitForTransactionReceipt({ hash });
    const second = await anchor.write.anchor([receipt(2), 250], { account: anchorer.account });
    const { gasUsed: steadyGas } = await publicClient.waitForTransactionReceipt({ hash: second });
    console.log(`      anchor() gas: first batch ${gasUsed}, later batches ${steadyGas}`);
    assert.ok(steadyGas < 120_000n);
  });
});
