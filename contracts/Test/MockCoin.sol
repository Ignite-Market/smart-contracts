// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract MockCoin is ERC20PresetMinterPauser {

    constructor() ERC20PresetMinterPauser("Mock", "MCK") {
        _mint(msg.sender, 100_000 * 10**6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucetMint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }
}
