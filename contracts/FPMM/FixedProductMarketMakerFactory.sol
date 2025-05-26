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
        uint fee,
        uint treasuryPercent,
        address treasury,
        uint fundingThreshold,
        uint endTime
    );

    FixedProductMarketMaker public implementationMaster;

    string public constant NAME = "FPMM Shares";
    string public constant SYMBOL = "FPMM";

    constructor() {
        implementationMaster = new FixedProductMarketMaker();
    }

    function cloneConstructor(bytes calldata consData) external {
        (
            ConditionalTokens conditionalTokens_,
            IERC20 collateralToken_,
            uint fee_,
            uint treasuryPercent_,
            address treasury_,
            uint fundingThreshold_,
            uint endTime_
        ) = abi.decode(consData, (ConditionalTokens, IERC20, uint, uint, address, uint, uint));

        FixedProductMarketMaker(address(this)).initializeBase(
            NAME,
            SYMBOL,
            conditionalTokens_,
            collateralToken_,
            fee_,
            treasuryPercent_,
            treasury_,
            fundingThreshold_,
            endTime_,
            msg.sender
        );
    }

    function createFixedProductMarketMaker(
        ConditionalTokens conditionalTokens_,
        IERC20 collateralToken_,
        uint fee_,
        uint treasuryPercent_,
        address treasury_,
        uint fundingThreshold_,
        uint endTime_,
        bytes32 salt
    ) external returns (FixedProductMarketMaker) {
        bytes memory initData = _generateInitData(
            conditionalTokens_,
            collateralToken_,
            fee_,
            treasuryPercent_,
            treasury_,
            fundingThreshold_,
            endTime_,
            msg.sender
        );

        FixedProductMarketMaker fpm = FixedProductMarketMaker(
            create2Clone(address(implementationMaster), initData, salt)
        );

        emit FixedProductMarketMakerCreation(
            msg.sender,
            fpm,
            conditionalTokens_,
            collateralToken_,
            fee_,
            treasuryPercent_,
            treasury_,
            fundingThreshold_,
            endTime_
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
        uint fee_,
        uint treasuryPercent_,
        address treasury_,
        uint fundingThreshold_,
        uint endTime_,
        address creator_
    ) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(
            FixedProductMarketMaker.initializeBase.selector,
            NAME,
            SYMBOL,
            conditionalTokens_,
            collateralToken_,
            fee_,
            treasuryPercent_,
            treasury_,
            fundingThreshold_,
            endTime_,
            creator_
        );
    }
}
