// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../Oracle/interfaces/IJsonApi.sol";

contract DummyVerification {
    function verifyJsonApi(
        IJsonApi.Proof calldata
    ) external view returns (bool _proved) {
        _proved = true;
    }
}
    