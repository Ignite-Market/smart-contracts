// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ConditionalToken is ERC20 {
    uint256 public constant maxSupply = 100_000_000 * 1e18;
    uint8 public noOfDecimals;

    constructor(
        string memory name, 
        string memory symbol,
        uint8 _decimals,
        address _receiver
    ) ERC20(name, symbol) {
        noOfDecimals = _decimals;
        _mint(_receiver, maxSupply);
    }

    function decimals() public view override returns (uint8) {
        return noOfDecimals;
    }
}
