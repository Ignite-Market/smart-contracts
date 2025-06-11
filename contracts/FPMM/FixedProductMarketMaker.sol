// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ConditionalTokens } from "./../ConditionalTokens/ConditionalTokens.sol";
import { CTHelpers } from "./../ConditionalTokens/CTHelpers.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

library CeilDiv {
    function ceildiv(uint x, uint y) internal pure returns (uint) {
        if(x > 0) return ((x - 1) / y) + 1;
        return x / y;
    }
}

contract FixedProductMarketMaker is ERC20Upgradeable, IERC1155Receiver, ReentrancyGuard {
    using CeilDiv for uint;
    using SafeERC20 for IERC20;

    uint constant ONE = 10**18;

    ConditionalTokens public conditionalTokens;
    IERC20 public collateralToken;
    bytes32[] public conditionIds;
    uint public fee;
    uint internal feePoolWeight;

    address public treasury;
    uint public treasuryPercent;
    uint public fundingThreshold;
    uint public endTime;
    uint public constant percentUL = 10000;

    uint[] public outcomeSlotCounts;
    bytes32[][] public collectionIds;
    uint[] public positionIds;
    mapping(address => uint256) public withdrawnFees;
    uint internal totalWithdrawnFees;

    uint public fundingAmountTotal;
    uint public currentLiquidity;

    bool public isSetupComplete;
    address public creator;

    event FPMMFundingAdded(address indexed funder, uint[] amountsAdded, uint sharesMinted);
    event FPMMFundingRemoved(address indexed funder, uint[] amountsRemoved, uint collateralRemovedFromFeePool, uint sharesBurnt);
    event FPMMBuy(address indexed buyer, uint investmentAmount, uint feeAmount, uint indexed outcomeIndex, uint outcomeTokensBought);
    event FPMMSell(address indexed seller, uint returnAmount, uint feeAmount, uint indexed outcomeIndex, uint outcomeTokensSold);

    struct SetupFrame {
        uint remainingConditions;
        bytes32 parentCollectionId;
    }

    SetupFrame[] private setupStack;
    bool public isSetupStarted;
    uint public setupStepsProcessed;

    string public constant NAME = "FPMM Shares";
    string public constant SYMBOL = "FPMM";

    modifier onlyWhenSetupComplete() {
        require(isSetupComplete, "Setup not complete");
        _;
    }

    modifier onlyCreator() {
        require(msg.sender == creator, "not creator");
        _;
    }

    function initializeBase(
        ConditionalTokens _conditionalTokens,
        IERC20 _collateralToken,
        bytes32[] memory conditions,
        uint _fee,
        uint _treasuryPercent,
        address _treasury,
        uint _fundingThreshold,
        uint _endTime,
        address _creator
    ) external initializer {
        require(address(conditionalTokens) == address(0), "already initialized");
        require(_treasuryPercent <= 10000, "treasury percent must be <= 10000");
        require(_fee < ONE, "fee must be less than or equal to ONE");
        __ERC20_init(NAME, SYMBOL); // initialize ERC20 properly
        conditionalTokens = _conditionalTokens;
        collateralToken = _collateralToken;
        fee = _fee;
        treasuryPercent = _treasuryPercent;
        treasury = _treasury;
        fundingThreshold = _fundingThreshold;
        endTime = _endTime;
        creator = _creator;

        for (uint i = 0; i < conditions.length; i++) {
            uint count = conditionalTokens.getOutcomeSlotCount(conditions[i]);
            conditionIds.push(conditions[i]);
            outcomeSlotCounts.push(count);
        }
    }

    function finalizeSetup() external onlyCreator {
        require(!isSetupComplete, "Already finalized");
        require(!isSetupStarted, "Setup already started");
        require(conditionIds.length > 0, "No conditions added");

        collectionIds = new bytes32[][](conditionIds.length);

        // Start setup
        isSetupStarted = true;

        // Push initial frame
        setupStack.push(SetupFrame({
            remainingConditions: conditionIds.length,
            parentCollectionId: bytes32(0)
        }));

        // Run first batch of steps
        _processSetupSteps(40);
    }

    function stepFinalizeSetup(uint steps) external onlyCreator {
        require(isSetupStarted, "Setup not started");
        require(!isSetupComplete, "Setup already finalized");

        _processSetupSteps(steps);
    }

    function _processSetupSteps(uint maxSteps) internal {
        uint steps = 0;

        while (setupStack.length > 0 && steps < maxSteps) {
            SetupFrame memory frame = setupStack[setupStack.length - 1];
            setupStack.pop();

            if (frame.remainingConditions == 0) {
                uint positionId = CTHelpers.getPositionId(collateralToken, frame.parentCollectionId);
                positionIds.push(positionId);
            } else {
                uint idx = frame.remainingConditions - 1;
                uint outcomeSlotCount = outcomeSlotCounts[idx];

                // Only add the parent collection ID if it's not already in the array
                bool exists = false;
                for (uint j = 0; j < collectionIds[idx].length; j++) {
                    if (collectionIds[idx][j] == frame.parentCollectionId) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    collectionIds[idx].push(frame.parentCollectionId);
                }

                for (uint i = 0; i < outcomeSlotCount; i++) {
                    bytes32 newCollectionId = CTHelpers.getCollectionId(
                        frame.parentCollectionId,
                        conditionIds[idx],
                        1 << i
                    );

                    setupStack.push(SetupFrame({
                        remainingConditions: idx,
                        parentCollectionId: newCollectionId
                    }));
                }
            }

            steps++;
        }

        setupStepsProcessed += steps;

        if (setupStack.length == 0) {
            isSetupComplete = true;
            isSetupStarted = false;
        }
    }

    function _recordCollectionIDsForAllConditions(uint conditionsLeft, bytes32 parentCollectionId) internal {
        if (conditionsLeft == 0) {
            uint positionId = CTHelpers.getPositionId(collateralToken, parentCollectionId);
            positionIds.push(positionId);
            return;
        }

        conditionsLeft--;

        uint outcomeSlotCount = outcomeSlotCounts[conditionsLeft];

        collectionIds[conditionsLeft].push(parentCollectionId);
        for (uint i = 0; i < outcomeSlotCount; i++) {
            bytes32 newCollectionId = CTHelpers.getCollectionId(
                parentCollectionId,
                conditionIds[conditionsLeft],
                1 << i
            );
            _recordCollectionIDsForAllConditions(
                conditionsLeft,
                newCollectionId
            );
        }
    }

    function getPoolBalances() private view returns (uint[] memory) {
        address[] memory thises = new address[](positionIds.length);
        for(uint i = 0; i < positionIds.length; i++) {
            thises[i] = address(this);
        }
        return conditionalTokens.balanceOfBatch(thises, positionIds);
    }

    function generateBasicPartition(uint outcomeSlotCount) private pure returns (uint[] memory partition) {
        partition = new uint[](outcomeSlotCount);
        for(uint i = 0; i < outcomeSlotCount; i++) {
            partition[i] = 1 << i;
        }
    }

    function splitPositionThroughAllConditions(uint amount) private {
        for(uint i = conditionIds.length; i > 0; i--) {
            uint[] memory partition = generateBasicPartition(outcomeSlotCounts[i - 1]);
            for(uint j = 0; j < collectionIds[i - 1].length; j++) {
                conditionalTokens.splitPosition(collateralToken, collectionIds[i - 1][j], conditionIds[i - 1], partition, amount);
            }
        }
    }

    function mergePositionsThroughAllConditions(uint amount) private {
        for(uint i = 0; i < conditionIds.length; i++) {
            uint[] memory partition = generateBasicPartition(outcomeSlotCounts[i]);
            for(uint j = 0; j < collectionIds[i].length; j++) {
                conditionalTokens.mergePositions(collateralToken, collectionIds[i][j], conditionIds[i], partition, amount);
            }
        }
    }

    function addFunding(uint addedFunds, uint[] calldata distributionHint) external nonReentrant onlyWhenSetupComplete {
        require(addedFunds > 0, "funding must be non-zero");

        uint[] memory sendBackAmounts = new uint[](positionIds.length);
        uint poolShareSupply = totalSupply();
        uint mintAmount;

        if(poolShareSupply > 0) {
            require(distributionHint.length == 0, "cannot use distribution hint after initial funding");
            uint[] memory poolBalances = getPoolBalances();
            uint poolWeight = 0;

            for(uint i = 0; i < poolBalances.length; i++) {
                if(poolWeight < poolBalances[i]) poolWeight = poolBalances[i];
            }

            for(uint i = 0; i < poolBalances.length; i++) {
                uint remaining = (addedFunds * poolBalances[i]) / poolWeight;
                sendBackAmounts[i] = addedFunds - remaining;
            }

            mintAmount = (addedFunds * poolShareSupply) / poolWeight;
        } else {
            if(distributionHint.length > 0) {
                require(distributionHint.length == positionIds.length, "hint length off");
                uint maxHint = 0;
                for(uint i = 0; i < distributionHint.length; i++) {
                    if(maxHint < distributionHint[i]) maxHint = distributionHint[i];
                }

                for(uint i = 0; i < distributionHint.length; i++) {
                    uint remaining = (addedFunds * distributionHint[i]) / maxHint;
                    require(remaining > 0, "must hint a valid distribution");
                    sendBackAmounts[i] = addedFunds - remaining;
                }
            }

            mintAmount = addedFunds;
        }

        collateralToken.safeTransferFrom(msg.sender, address(this), addedFunds);
        collateralToken.forceApprove(address(conditionalTokens), addedFunds);
        splitPositionThroughAllConditions(addedFunds);

        _mint(msg.sender, mintAmount);

        conditionalTokens.safeBatchTransferFrom(address(this), msg.sender, positionIds, sendBackAmounts, "");

        for (uint i = 0; i < sendBackAmounts.length; i++) {
            sendBackAmounts[i] = addedFunds - sendBackAmounts[i];
        }

        fundingAmountTotal += addedFunds;
        currentLiquidity += addedFunds;
        emit FPMMFundingAdded(msg.sender, sendBackAmounts, mintAmount);
    }

    function removeFunding(uint sharesToBurn) external nonReentrant onlyWhenSetupComplete {
        for(uint i = 0; i < conditionIds.length; i++) {
            require(conditionalTokens.payoutDenominator(conditionIds[i]) > 0, "cannot remove funding before condition is resolved");
        }

        uint[] memory poolBalances = getPoolBalances();
        uint[] memory sendAmounts = new uint[](poolBalances.length);
        uint poolShareSupply = totalSupply();

        for(uint i = 0; i < poolBalances.length; i++) {
            sendAmounts[i] = (poolBalances[i] * sharesToBurn) / poolShareSupply;
        }

        uint collateralRemovedFromFeePool = collateralToken.balanceOf(address(this));
        _burn(msg.sender, sharesToBurn);
        collateralRemovedFromFeePool = collateralRemovedFromFeePool - collateralToken.balanceOf(address(this));

        conditionalTokens.safeBatchTransferFrom(address(this), msg.sender, positionIds, sendAmounts, "");

        uint256 removedFunds = (currentLiquidity * sharesToBurn) / poolShareSupply;
        currentLiquidity -= removedFunds;

        emit FPMMFundingRemoved(msg.sender, sendAmounts, collateralRemovedFromFeePool, sharesToBurn);
    }

    function buy(uint investmentAmount, uint outcomeIndex, uint minOutcomeTokensToBuy) external nonReentrant onlyWhenSetupComplete {
        require(canTrade(), "trading not allowed");
        require((investmentAmount * 100) / currentLiquidity <= 10, "amount can be up to 10% of currentLiquidity");

        uint outcomeTokensToBuy = calcBuyAmount(investmentAmount, outcomeIndex);
        require(outcomeTokensToBuy >= minOutcomeTokensToBuy, "minimum buy amount not reached");

        collateralToken.safeTransferFrom(msg.sender, address(this), investmentAmount);
        uint feeAmount = (investmentAmount * fee) / ONE;
        feePoolWeight += feeAmount;
        uint investmentAmountMinusFees = investmentAmount - feeAmount;

        collateralToken.forceApprove(address(conditionalTokens), investmentAmountMinusFees);
        splitPositionThroughAllConditions(investmentAmountMinusFees);

        conditionalTokens.safeTransferFrom(address(this), msg.sender, positionIds[outcomeIndex], outcomeTokensToBuy, "");

        currentLiquidity += investmentAmountMinusFees;
        emit FPMMBuy(msg.sender, investmentAmount, feeAmount, outcomeIndex, outcomeTokensToBuy);
    }

    function sell(uint returnAmount, uint outcomeIndex, uint maxOutcomeTokensToSell) external nonReentrant onlyWhenSetupComplete {
        require(canTrade(), "trading not allowed");
        require((returnAmount * 100) / currentLiquidity <= 10, "amount can be up to 10% of currentLiquidity");

        uint outcomeTokensToSell = calcSellAmount(returnAmount, outcomeIndex);
        require(outcomeTokensToSell <= maxOutcomeTokensToSell, "maximum sell amount exceeded");

        conditionalTokens.safeTransferFrom(msg.sender, address(this), positionIds[outcomeIndex], outcomeTokensToSell, "");
        uint feeAmount = (returnAmount * fee) / (ONE - fee);
        feePoolWeight += feeAmount;
        uint returnAmountPlusFees = returnAmount + feeAmount;

        mergePositionsThroughAllConditions(returnAmountPlusFees);
        collateralToken.safeTransfer(msg.sender, returnAmount);

        currentLiquidity -= returnAmount;
        emit FPMMSell(msg.sender, returnAmount, feeAmount, outcomeIndex, outcomeTokensToSell);
    }

    function calcBuyAmount(uint investmentAmount, uint outcomeIndex) public view returns (uint) {
        require(outcomeIndex < positionIds.length, "invalid outcome index");

        uint[] memory poolBalances = getPoolBalances();
        uint investmentAmountMinusFees = investmentAmount - (investmentAmount * fee) / ONE;
        uint buyTokenPoolBalance = poolBalances[outcomeIndex];
        uint endingOutcomeBalance = buyTokenPoolBalance * ONE;

        for(uint i = 0; i < poolBalances.length; i++) {
            if(i != outcomeIndex) {
                uint poolBalance = poolBalances[i];
                endingOutcomeBalance = endingOutcomeBalance * poolBalance / (poolBalance + investmentAmountMinusFees);
            }
        }

        require(endingOutcomeBalance > 0, "must have non-zero balances");
        return buyTokenPoolBalance + investmentAmountMinusFees - endingOutcomeBalance / ONE;
    }

    function withdrawFees(address account) public onlyWhenSetupComplete {
        uint256 rawAmount = feePoolWeight * balanceOf(account) / totalSupply();
        uint256 pendingAmount = rawAmount - withdrawnFees[account];

        if (pendingAmount > 0) {
            withdrawnFees[account] = rawAmount;
            totalWithdrawnFees += pendingAmount;

            uint256 treasuryAmount = pendingAmount * treasuryPercent / percentUL;
            collateralToken.safeTransfer(treasury, treasuryAmount);

            uint256 userAmount = pendingAmount - treasuryAmount;
            collateralToken.safeTransfer(account, userAmount);
        }
    }

    function feesWithdrawableBy(address account) public view returns (uint256) {
        uint256 rawAmount = feePoolWeight * balanceOf(account) / totalSupply();

        // subtract already withdrawn fees (includes treasury fee)
        rawAmount = rawAmount - withdrawnFees[account];

        // subtract treasury fee
        uint256 treasuryAmount = rawAmount * treasuryPercent / percentUL;

        return rawAmount - treasuryAmount;
    }

    function calcSellAmount(uint returnAmount, uint outcomeIndex) public view returns (uint) {
        require(outcomeIndex < positionIds.length, "invalid outcome index");

        uint[] memory poolBalances = getPoolBalances();
        uint returnAmountPlusFees = returnAmount * ONE / (ONE - fee);
        uint sellTokenPoolBalance = poolBalances[outcomeIndex];
        uint endingOutcomeBalance = sellTokenPoolBalance * ONE;

        for(uint i = 0; i < poolBalances.length; i++) {
            if(i != outcomeIndex) {
                uint poolBalance = poolBalances[i];
                endingOutcomeBalance = endingOutcomeBalance * poolBalance / (poolBalance - returnAmountPlusFees);
            }
        }

        require(endingOutcomeBalance > 0, "must have non-zero balances");
        return returnAmountPlusFees + endingOutcomeBalance / ONE - sellTokenPoolBalance;
    }

    function isFunded() public view returns (bool) {
        return fundingAmountTotal >= fundingThreshold;
    }

    function canTrade() public view returns (bool) {
        return isSetupComplete && fundingAmountTotal >= fundingThreshold && block.timestamp < endTime;
    }

    function _update(address from, address to, uint256 amount) internal virtual override {
        if (from != address(0)) {
            withdrawFees(from);
        }

        uint totalSupply = totalSupply();
        uint withdrawnFeesTransfer = totalSupply == 0 ?
            amount :
            feePoolWeight * amount / totalSupply;

        if (from != address(0)) {
            withdrawnFees[from] = withdrawnFees[from] - withdrawnFeesTransfer;
            totalWithdrawnFees = totalWithdrawnFees - withdrawnFeesTransfer;
        } else {
            feePoolWeight = feePoolWeight + withdrawnFeesTransfer;
        }
        if (to != address(0)) {
            withdrawnFees[to] = withdrawnFees[to] + withdrawnFeesTransfer;
            totalWithdrawnFees = totalWithdrawnFees + withdrawnFeesTransfer;
        } else {
            feePoolWeight = feePoolWeight - withdrawnFeesTransfer;
        }
        super._update(from, to, amount);
    }

    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external override returns(bytes4) {
         if (operator == address(this)) {
            return this.onERC1155Received.selector;
        }
        return 0x0;
    }

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external override returns(bytes4) {
        if (operator == address(this) && from == address(0)) {
            return this.onERC1155BatchReceived.selector;
        }
        return 0x0;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || 
               interfaceId == type(IERC165).interfaceId;
    }

    function getFeePoolWeight() external view returns (uint256) {
        return feePoolWeight;
    }
}
