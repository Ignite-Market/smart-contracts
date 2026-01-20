// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ConditionalTokens } from "./../ConditionalTokens/ConditionalTokens.sol";
import { CTHelpers } from "./../ConditionalTokens/CTHelpers.sol";
import { ConstructedCloneFactory } from "./ConstructedCloneFactory.sol";
import { FixedProductMarketMaker } from "./FixedProductMarketMaker.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

contract FixedProductMarketMakerFactory is ConstructedCloneFactory {
    event FixedProductMarketMakerCreation(
        address indexed creator,
        FixedProductMarketMaker fixedProductMarketMaker,
        ConditionalTokens indexed conditionalTokens,
        IERC20 indexed collateralToken,
        bytes32[] conditions,
        uint fee,
        uint treasuryPercent,
        address treasury,
        uint fundingThreshold,
        uint endTime,
        uint buySellCapPercent
    );

    FixedProductMarketMaker public implementationMaster;

    constructor() {
        implementationMaster = new FixedProductMarketMaker();
    }

    function cloneConstructor(bytes calldata consData) external {
        (
            ConditionalTokens conditionalTokens_,
            IERC20 collateralToken_,
            bytes32[] memory conditions,
            uint fee_,
            uint treasuryPercent_,
            address treasury_,
            uint fundingThreshold_,
            uint endTime_,
            uint buySellCapPercent_
        ) = abi.decode(consData, (ConditionalTokens, IERC20, bytes32[], uint, uint, address, uint, uint, uint));

        FixedProductMarketMaker(address(this)).initializeBase(
            conditionalTokens_,
            collateralToken_,
            conditions,
            fee_,
            treasuryPercent_,
            treasury_,
            fundingThreshold_,
            endTime_,
            buySellCapPercent_,
            msg.sender
        );
    }

    function createFixedProductMarketMaker(
        ConditionalTokens conditionalTokens_,
        IERC20 collateralToken_,
        bytes32[] memory conditions,
        uint fee_,
        uint treasuryPercent_,
        address treasury_,
        uint fundingThreshold_,
        uint endTime_,
        uint buySellCapPercent_,
        bytes32 salt
    ) external returns (FixedProductMarketMaker) {
        bytes memory initData = _generateInitData(
            conditionalTokens_,
            collateralToken_,
            conditions,
            fee_,
            treasuryPercent_,
            treasury_,
            fundingThreshold_,
            endTime_,
            buySellCapPercent_,
            msg.sender
        );

        FixedProductMarketMaker fpm = FixedProductMarketMaker(
            create2Clone(address(implementationMaster), initData, salt)
        );

        conditionalTokens_.setMarketMaker(address(fpm), true);

        emit FixedProductMarketMakerCreation(
            msg.sender,
            fpm,
            conditionalTokens_,
            collateralToken_,
            conditions,
            fee_,
            treasuryPercent_,
            treasury_,
            fundingThreshold_,
            endTime_,
            buySellCapPercent_
        );

        return fpm;
    }

    function predictFixedProductMarketMakerAddress(bytes32 salt)
        external
        view
        returns (address predicted)
    {
        bytes20 targetBytes = bytes20(address(implementationMaster));
        bytes32 codeHash = keccak256(abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            targetBytes,
            hex"5af43d82803e903d91602b57fd5bf3"
        ));

        predicted = address(uint160(uint(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            codeHash
        )))));
    }

    function _generateInitData(
        ConditionalTokens conditionalTokens_,
        IERC20 collateralToken_,
        bytes32[] memory conditions,
        uint fee_,
        uint treasuryPercent_,
        address treasury_,
        uint fundingThreshold_,
        uint endTime_,
        uint buySellCapPercent_,
        address creator_
    ) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(
            FixedProductMarketMaker.initializeBase.selector,
            conditionalTokens_,
            collateralToken_,
            conditions,
            fee_,
            treasuryPercent_,
            treasury_,
            fundingThreshold_,
            endTime_,
            buySellCapPercent_,
            creator_
        );
    }
}
