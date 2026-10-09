# 08 — Proof-of-Execution Ledger (blockchain)

**Claim we make:** "Every FlowLedger run gets a receipt. Anyone can check, without trusting us, that the receipt existed at time T and hasn't changed since. An owner can also check that the stored run data still matches it."

**Claims we don't make:**
- That we "store data on blockchain". We store only Merkle roots.
- That the integrations themselves behaved correctly. We prove *what we recorded*, not what Gmail did.

## Why blockchain here (judges will ask)
Ordinary audit logs live in the vendor's database, so the vendor (or an attacker) can edit them silently. Anchoring a hash on a public chain gives an **independent timestamp and a commitment we can't edit**. Batching with a Merkle tree makes this cheap: one transaction covers hundreds of runs. Nothing else in the stack provides this property.

## Building blocks
| Piece | Choice |
|---|---|
| Chain | **Polygon Amoy testnet** (chain id 80002). Cheap, fast blocks, and the current Polygon PoS testnet (Mumbai was retired in April 2024). Fallbacks: local `anvil` (Compose) or Ethereum Sepolia, switched by env |
| Contract | `FlowLedgerAnchor.sol` on OpenZeppelin v5 (`AccessControl`, `Pausable`, `MerkleProof`) |
| Toolchain | Hardhat 3 (npm only, no Docker): compile, test (TS and Solidity tests), deploy (Ignition), verify on Polygonscan |
| Client | viem: the anchorer (server wallet) and the verify page (read-only public RPC) |
| Merkle | `@openzeppelin/merkle-tree` `StandardMerkleTree` with leaf type `["bytes32"]`. Leaves are double-hashed, matching `MerkleProof.sol` and preventing second-preimage attacks |
| Canonical JSON | RFC 8785 JCS (`canonicalize` npm). The same bytes hash the same way in Node and the browser |

## Receipt v1 (stored off-chain, never on-chain)
```json
{
  "v": 1,
  "executionId": "ex_9fK2…",
  "workspace": "0x<sha256(serverPepper ‖ workspaceId)>",
  "workflowId": "wf_…",
  "versionHash": "0x<sha256(JCS(published definition))>",
  "trigger": "form",
  "status": "success",
  "queuedAt": "2026-10-09T10:00:00.812Z",
  "completedAt": "2026-10-09T10:00:03.120Z",
  "steps": [
    { "nodeId": "n1", "action": "Form Submitted", "status": "success", "attempt": 1, "inputHash": "0x…", "outputHash": "0x…" },
    { "nodeId": "n2", "action": "AI: Classify",   "status": "success", "attempt": 1, "inputHash": "0x…", "outputHash": "0x…" },
    { "nodeId": "n3", "action": "Sheets: Append", "status": "success", "attempt": 2, "inputHash": "0x…", "outputHash": "0x…" }
  ],
  "prev": "0x<receiptHash of previous run in this workspace>"
}
```
- `inputHash` / `outputHash` = `sha256(salt ‖ JCS(full step data))`, with a random 16-byte `salt` per execution, kept off-chain.
- `receiptHash` = `keccak256(utf8(JCS(receipt)))`.
- Leaf = `keccak256(bytes.concat(keccak256(abi.encode(receiptHash))))`, the OpenZeppelin standard leaf.
- `prev` chains the receipts within a workspace, so deleting or reordering a run breaks the chain.

## Contract (P1F; final code is in `contracts/`)
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract FlowLedgerAnchor is AccessControl, Pausable {
    bytes32 public constant ANCHORER_ROLE = keccak256("ANCHORER_ROLE");

    struct Batch { bytes32 root; uint64 anchoredAt; uint32 leafCount; } // root: 1 slot, rest packed: 1 slot
    Batch[] private _batches;

    event BatchAnchored(uint256 indexed batchId, bytes32 indexed root, uint32 leafCount, uint64 anchoredAt);
    error EmptyBatch();

    constructor(address admin, address anchorer) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ANCHORER_ROLE, anchorer);
    }

    function anchor(bytes32 root, uint32 leafCount)
        external onlyRole(ANCHORER_ROLE) whenNotPaused returns (uint256 batchId)
    {
        if (root == bytes32(0) || leafCount == 0) revert EmptyBatch();
        batchId = _batches.length;
        _batches.push(Batch(root, uint64(block.timestamp), leafCount));
        emit BatchAnchored(batchId, root, leafCount, uint64(block.timestamp));
    }

    function verifyReceipt(uint256 batchId, bytes32 receiptHash, bytes32[] calldata proof)
        external view returns (bool)
    {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(receiptHash))));
        return MerkleProof.verifyCalldata(proof, _batches[batchId].root, leaf);
    }

    function batch(uint256 id) external view returns (Batch memory) { return _batches[id]; }
    function batchCount() external view returns (uint256) { return _batches.length; }
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
```
**Contract tests (Hardhat):**
- Only the anchorer can anchor, and an admin can pause.
- An empty batch reverts.
- An event is emitted with the right id.
- `verifyReceipt` returns true for a valid OpenZeppelin proof (generated in TypeScript), false for a modified receipt hash, and false for a wrong batch.
- Gas snapshot for `anchor`.

## Anchorer job
1. Every 30 s (demo) or 5 min (prod): select `receipts where status='pending'`, up to 1,000 per batch.
2. Build a `StandardMerkleTree` and store the `proof` and `leaf_index` for each receipt in one DB transaction (batch status `building`).
3. Send `anchor(root, leafCount)` from the anchorer wallet (testnet only; key from env), with nonce management via viem. Status → `submitted` with `tx_hash`.
4. Wait for 2 confirmations (a few seconds on Amoy). Parse `BatchAnchored` for `chain_batch_id`. Status → `confirmed`, receipts → `anchored`.
5. Emit a `receipt.anchored` SSE event, so the run page badge flips from "Pending anchor" to "✓ On-chain".
6. On failure: retry with backoff. If the RPC is down for more than 2 minutes, raise an alert notification. Runs are never blocked.

## Verification layers (on `/verify/{executionId}`)
| Layer | Where it runs | Trust needed | What it proves |
|---|---|---|---|
| 1. Inclusion | **Browser** (OZ merkle-tree + JCS + keccak) | None | The receipt hash is in the batch's Merkle root |
| 2. Anchoring | **Browser** reads `batch(id)` via a public Amoy RPC with viem | Only the chain | That root was committed on-chain at block time T |
| 3. Data integrity | **Browser**, owner only: decrypted step data is fetched and re-hashed with the salt | The owner's own session | The stored run data still matches the receipt, step by step |
| 4. Chain continuity | Browser walks `prev` links for the last N receipts | None | No run was deleted or reordered |

The UI shows four checkmarks that animate one after another, plus a Polygonscan link.

## Tamper simulator (demo, honest by design)
- Available **only in the demo workspace** and only to admins. Every use writes a `tamper_events` row and shows a banner on the page.
- Action: changes one field in a stored step's output (for example the Sheet row number or the email address). The data is decrypted, edited and re-encrypted, so it looks like a real silent edit.
- Result: layer 3 fails at that step. The page shows ✗ **"Tampered: step 3 'Sheets: Append' output changed after anchoring"**. Layers 1 and 2 still pass, which shows the original record is intact on-chain.
- A **"Restore"** button reverts the edit for the next demo.

## Costs (estimate, to be measured in P2)
- `anchor()` writes 2 new storage slots, updates the array length and emits an event. Estimate: **~70k–95k gas**. At 30 gwei that is about 0.002–0.003 test POL per batch, so one 0.1 POL faucet drip covers about 30+ batches. Not measured yet; the Hardhat gas reporter will measure it in P1F and Amoy receipts in P2.
- Demo mode anchors only when receipts are pending, so idle time costs nothing.

## Privacy
- On-chain: only 32-byte Merkle roots.
- Off-chain receipts: hashes plus ids, no personal data. Step hashes are salted.
- Erasure request: delete the submission, the step data and the **salt**. The on-chain root and receipt hash remain but can no longer be linked to anyone. This is our answer to "the blockchain is immutable, so how do you delete data?"

## Keys and config
`CHAIN_ID`, `CHAIN_RPC_URL` (Alchemy free or public), `ANCHOR_CONTRACT_ADDRESS`, `ANCHORER_PRIVATE_KEY` (a **testnet-only** wallet, generated fresh, never reused), `EXPLORER_BASE_URL`, `ETHERSCAN_API_KEY` (optional, for contract verification; Etherscan API v2 covers Amoy).
