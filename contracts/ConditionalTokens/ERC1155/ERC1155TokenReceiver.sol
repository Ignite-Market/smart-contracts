// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./IERC1155TokenReceiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

abstract contract ERC1155TokenReceiver is IERC1155TokenReceiver {
    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external virtual override returns(bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external virtual override returns(bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external view virtual override returns (bool) {
        return interfaceId == type(IERC1155TokenReceiver).interfaceId || 
               interfaceId == type(IERC165).interfaceId;
    }
}