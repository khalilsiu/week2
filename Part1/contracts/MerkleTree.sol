//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {PoseidonT3} from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract
import "./console.sol";

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves
        uint256 zero = uint256(0);
        uint256[] memory zeros = new uint256[](8);

        for (uint256 i = 0; i < 8; i++) {
            zeros[i] = zero;
        }
        uint256[] memory rootArr;
        uint256[] memory treeHashes;
        (rootArr, hashes) = constructTree(zeros, zeros.length, treeHashes);
        root = rootArr[0];
    }

    function constructTree(
        uint256[] memory levelHashes,
        uint256 elemLength,
        uint256[] memory treeHashes
    ) internal returns (uint256[] memory, uint256[] memory) {
        // construct hashes
        uint256[] memory newTreeHashes = new uint256[](elemLength + treeHashes.length);
        for (uint256 i = 0; i < treeHashes.length; i++) {
            newTreeHashes[i] = treeHashes[i];
        }
        for (uint256 i = 0; i < levelHashes.length; i++) {
            newTreeHashes[i + treeHashes.length] = levelHashes[i];
        }

        if (elemLength == 1) {
            return (levelHashes, newTreeHashes);
        }
        uint256[] memory hashed = new uint256[](elemLength/2);

        for (uint256 i = 0; i < levelHashes.length / 2; i++) {
            hashed[i] = hashLeftRight(2 * i, 2 * i + 1);
        }
        return constructTree(hashed, hashed.length, newTreeHashes);
    }

    function hashLeftRight(uint256 left, uint256 right)
        internal
        pure
        returns (uint256)
    {
        return PoseidonT3.poseidon([left, right]);
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree
        uint256[] memory elemArr = new uint256[](8);
        elemArr[0] = hashedLeaf;
        for (uint256 i = 0; i < 7; i++) {
            elemArr[i + 1] = hashes[i];
        }
        uint256[] memory rootArr;
        uint256[] memory treeHashes;
        (rootArr, hashes) = constructTree(elemArr, elemArr.length, treeHashes);
        uint256 newRoot = rootArr[0];
        return newRoot;
    }

    function verify(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[1] memory input
    ) public view returns (bool) {
        // [assignment] verify an inclusion proof and check that the proof root matches current root
        return verifyProof(a, b, c, input);
    }
}
