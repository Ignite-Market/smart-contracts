// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract Forwarder is IERC1155Receiver {
    function call(address to, bytes calldata data) external {
        (bool success, bytes memory retData) = to.call(data);
        require(success, string(retData));
    }

    function onERC1155Received(
        address /* operator */,
        address /* from */,
        uint256 /* id */,
        uint256 /* value */,
        bytes calldata /* data */
    )
        external
        override
        returns(bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address /* operator */,
        address /* from */,
        uint256[] calldata /* ids */,
        uint256[] calldata /* values */,
        bytes calldata /* data */
    )
        external
        override
        returns(bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external view override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || 
               interfaceId == type(IERC165).interfaceId;
    }
}