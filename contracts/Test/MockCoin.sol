pragma solidity ^0.5.1;
import { ERC20Mintable } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";

contract MockCoin is ERC20Mintable {

    string public name = "Trend"; 
    string public symbol = "TREND";

    constructor() public {
        _mint(msg.sender, 100_000 * 10**6);
    }

    function decimals() public view returns (uint8) {
        return 6;
    }

    function faucetMint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }
}
