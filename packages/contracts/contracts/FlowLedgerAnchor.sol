// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title FlowLedgerAnchor
/// @notice Proof-of-Execution for FlowLedger (docs/08). Each batch commits the
/// Merkle root of many run receipts. Only 32-byte roots are stored on-chain:
/// no personal data, no receipt contents.
contract FlowLedgerAnchor is AccessControl, Pausable {
    bytes32 public constant ANCHORER_ROLE = keccak256("ANCHORER_ROLE");

    /// root: one slot; anchoredAt + leafCount pack into a second slot.
    struct Batch {
        bytes32 root;
        uint64 anchoredAt;
        uint32 leafCount;
    }

    Batch[] private _batches;

    event BatchAnchored(uint256 indexed batchId, bytes32 indexed root, uint32 leafCount, uint64 anchoredAt);

    error EmptyBatch();
    error UnknownBatch(uint256 batchId);

    constructor(address admin, address anchorer) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ANCHORER_ROLE, anchorer);
    }

    /// @notice Commit a batch root. Returns the new batch id.
    function anchor(bytes32 root, uint32 leafCount)
        external
        onlyRole(ANCHORER_ROLE)
        whenNotPaused
        returns (uint256 batchId)
    {
        if (root == bytes32(0) || leafCount == 0) revert EmptyBatch();
        batchId = _batches.length;
        uint64 at = uint64(block.timestamp);
        _batches.push(Batch(root, at, leafCount));
        emit BatchAnchored(batchId, root, leafCount, at);
    }

    /// @notice True if `receiptHash` is a leaf of batch `batchId`, using the
    /// OpenZeppelin StandardMerkleTree leaf encoding (double keccak256).
    function verifyReceipt(uint256 batchId, bytes32 receiptHash, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        if (batchId >= _batches.length) revert UnknownBatch(batchId);
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(receiptHash))));
        return MerkleProof.verifyCalldata(proof, _batches[batchId].root, leaf);
    }

    function batch(uint256 batchId) external view returns (Batch memory) {
        if (batchId >= _batches.length) revert UnknownBatch(batchId);
        return _batches[batchId];
    }

    function batchCount() external view returns (uint256) {
        return _batches.length;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
