// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract ConstructedCloneFactory {
    error CreateError();

    function _create2Clone(address target, bytes32 salt) internal returns (address result) {
        bytes20 targetBytes = bytes20(target);
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            result := create2(0, clone, 0x37, salt)
        }
        if (result == address(0)) {
            revert CreateError();
        }
    }

    function _clone(address target) internal returns (address result) {
        bytes20 targetBytes = bytes20(target);
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            result := create(0, clone, 0x37)
        }
        if (result == address(0)) {
            revert CreateError();
        }
    }

    function createClone(address target, bytes memory constructorData) internal returns (address instance) {
        instance = _clone(target);
        (bool ok, ) = instance.call(constructorData);
        if (!ok) revert CreateError();
    }

   function create2Clone(address target, bytes memory constructorData, bytes32 salt) internal returns (address instance) {
        instance = _create2Clone(target, salt);
        (bool ok, ) = instance.call(constructorData);
        if (!ok) revert CreateError();
    }
}