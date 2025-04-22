const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
    getConditionId,
    getPositionId,
    getCollectionId
} = require('./helpers/id-helpers.js');
const { randomHex } = require('./helpers/utils.js');

describe('FixedProductMarketMakerAmounts', function() {
    let creator, oracle, investor1, trader, investor2, treasury;
    const questionId = randomHex(32);
    const numOutcomes = 2; // 64 originally from gnosis tests
    let conditionId;
    let collectionIds;

    let conditionalTokens;
    let collateralToken;
    let fixedProductMarketMakerFactory;
    let positionIds;
    let fixedProductMarketMaker;
    const feeFactor = ethers.utils.parseEther("0.01"); // 1%
    const treasuryPercent = 100; // 1%
    const fundingThreshold = ethers.utils.parseUnits("100", 6); // 100 USDC
    let marketMakerPool;
    const winningIndex = 0; // Always the same winning index
    const reportPayoutsAr = [1,0];

    const DAY = 60 * 60 * 24;
    let endTime;

    before(async function() {
        await hre.network.provider.send("hardhat_reset");
    });

    beforeEach(async () => {
        [, creator, oracle, investor1, trader, investor2, treasury] = await ethers.getSigners();
        
        conditionId = getConditionId(oracle.address, questionId, numOutcomes);
        collectionIds = Array.from(
            { length: numOutcomes },
            (_, i) => getCollectionId(conditionId, BigInt(1) << BigInt(i))
        );

        const ConditionalTokens = await ethers.getContractFactory("ConditionalTokens");
        const WETH9 = await ethers.getContractFactory("MockCoin");
        const FixedProductMarketMakerFactory = await ethers.getContractFactory("FixedProductMarketMakerFactory");

        conditionalTokens = await ConditionalTokens.deploy();
        collateralToken = await WETH9.deploy();
        fixedProductMarketMakerFactory = await FixedProductMarketMakerFactory.deploy();

        positionIds = collectionIds.map(collectionId => 
            getPositionId(collateralToken.address, collectionId)
        );

        endTime = Math.floor(new Date().getTime() / 1000) + DAY;
    });

    it('add + remove funding with no trades', async function() {
        await conditionalTokens.prepareCondition(oracle.address, questionId, numOutcomes);

        const createArgs = [
            conditionalTokens.address,
            collateralToken.address,
            [conditionId],
            feeFactor,
            treasuryPercent,
            treasury.address,
            fundingThreshold,
            endTime
        ];

        // Compute salt off-chain
        const salt = ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
                [
                    "address",      // creator
                    "string",       // name
                    "string",       // symbol
                    "address",      // conditionalTokens
                    "address",      // collateralToken
                    "bytes32[]",    // conditionIds
                    "uint256",      // fee
                    "uint256",      // treasuryPercent
                    "address",      // treasury
                    "uint256",      // fundingThreshold
                    "uint256"       // endTime
                ],
                [
                    creator.address,
                    "FPMM Shares",
                    "FPMM",
                    conditionalTokens.address,
                    collateralToken.address,
                    [conditionId],
                    feeFactor,
                    treasuryPercent,
                    treasury.address,
                    fundingThreshold,
                    endTime
                ]
            )
        );

        const predictedAddress = await fixedProductMarketMakerFactory
            .predictFixedProductMarketMakerAddress(salt);

        await fixedProductMarketMakerFactory.connect(creator)
            .createFixedProductMarketMaker(
                conditionalTokens.address,
                collateralToken.address,
                [conditionId],
                feeFactor,
                treasuryPercent,
                treasury.address,
                fundingThreshold,
                endTime,
                salt
            );

        fixedProductMarketMaker = await ethers.getContractAt(
            "FixedProductMarketMaker",
            predictedAddress
        );

        // Add funding
        const addedFunds1 = ethers.utils.parseUnits("100", 6);
        const initialDistribution = [];

        await collateralToken.connect(investor1).deposit({ value: addedFunds1 });
        await collateralToken.connect(investor1).approve(fixedProductMarketMaker.address, addedFunds1);

        expect(await collateralToken.balanceOf(investor1.address)).to.equal(addedFunds1);
        await fixedProductMarketMaker.connect(investor1).addFunding(addedFunds1, initialDistribution);
        expect(await collateralToken.balanceOf(investor1.address)).to.equal(0);

        // Resolve condition
        await conditionalTokens.connect(oracle).reportPayouts(questionId, reportPayoutsAr);

        // Remove funding
        const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
        await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

        // Collateral token should still be 0
        expect(await collateralToken.balanceOf(investor1.address)).to.equal(0);

        const indexSet = 1 << winningIndex;

        // Redeem collateral from winner CT
        const tx = await conditionalTokens.connect(investor1).redeemPositions(
            collateralToken.address, 
            ethers.constants.HashZero, 
            conditionId, 
            [indexSet]
        );

        await tx.wait();
        
        // Should get back the initial funding amount
        expect(await collateralToken.balanceOf(investor1.address)).to.equal(addedFunds1);
    });

    it('add + trade + remove funding with multiple trades trades', async function() {
        await conditionalTokens.prepareCondition(oracle.address, questionId, numOutcomes);

        const createArgs = [
            conditionalTokens.address,
            collateralToken.address,
            [conditionId],
            feeFactor,
            treasuryPercent,
            treasury.address,
            fundingThreshold,
            endTime
        ];

        // Compute salt off-chain
        const salt = ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
                [
                    "address",      // creator
                    "string",       // name
                    "string",       // symbol
                    "address",      // conditionalTokens
                    "address",      // collateralToken
                    "bytes32[]",    // conditionIds
                    "uint256",      // fee
                    "uint256",      // treasuryPercent
                    "address",      // treasury
                    "uint256",      // fundingThreshold
                    "uint256"       // endTime
                ],
                [
                    creator.address,
                    "FPMM Shares",
                    "FPMM",
                    conditionalTokens.address,
                    collateralToken.address,
                    [conditionId],
                    feeFactor,
                    treasuryPercent,
                    treasury.address,
                    fundingThreshold,
                    endTime
                ]
            )
        );

        const predictedAddress = await fixedProductMarketMakerFactory
            .predictFixedProductMarketMakerAddress(salt);

        await fixedProductMarketMakerFactory.connect(creator)
            .createFixedProductMarketMaker(
                conditionalTokens.address,
                collateralToken.address,
                [conditionId],
                feeFactor,
                treasuryPercent,
                treasury.address,
                fundingThreshold,
                endTime,
                salt
            );

        fixedProductMarketMaker = await ethers.getContractAt(
            "FixedProductMarketMaker",
            predictedAddress
        );

        // Add funding
        const addedFunds1 = ethers.utils.parseUnits("1000", 6); // 1,000 USDC initial funding
        // Distribute 50% to each outcome for balanced liquidity
        const initialDistribution = [
            ethers.utils.parseUnits("500", 6), // 500 USDC for outcome 0
            ethers.utils.parseUnits("500", 6)  // 500 USDC for outcome 1
        ];

        await collateralToken.connect(investor1).deposit({ value: addedFunds1 });
        await collateralToken.connect(investor1).approve(fixedProductMarketMaker.address, addedFunds1);

        expect(await collateralToken.balanceOf(investor1.address)).to.equal(addedFunds1);
        await fixedProductMarketMaker.connect(investor1).addFunding(addedFunds1, initialDistribution);
        expect(await collateralToken.balanceOf(investor1.address)).to.equal(0);

        // Generate realistic trade amounts
        const generateTradeAmount = () => {
            const random = Math.random();
            if (random < 0.6) {
                // 60% chance of trades between 20-50 USDC
                return Math.floor(Math.random() * 30 + 20);
            } else if (random < 0.8) {
                // 20% chance of trades between 10-20 USDC
                return Math.floor(Math.random() * 10 + 10);
            } else if (random < 0.95) {
                // 15% chance of trades between 50-80 USDC
                return Math.floor(Math.random() * 30 + 50);
            } else {
                // 5% chance of large trades between 80-100 USDC
                return Math.floor(Math.random() * 20 + 80);
            }
        };

        // Generate trades until we reach ~10,000 USDC volume
        const tradeAmounts = [];
        let totalVolume = ethers.BigNumber.from(0);
        const targetVolume = ethers.utils.parseUnits("10000", 6); // 10,000 USDC target volume

        while (totalVolume.lt(targetVolume)) {
            const amount = generateTradeAmount();
            const outcomeIndex = Math.random() < 0.5 ? 0 : 1; // 50/50 chance for each outcome
            const user = Math.random() < 0.5 ? trader : investor2; // Alternate between traders
            
            tradeAmounts.push({
                amount: ethers.utils.parseUnits(amount.toString(), 6),
                outcomeIndex,
                user
            });
            
            totalVolume = totalVolume.add(ethers.utils.parseUnits(amount.toString(), 6));
        }

        console.log("\nInitial pool balances:");
        for (let i = 0; i < positionIds.length; i++) {
            const balance = await conditionalTokens.balanceOf(fixedProductMarketMaker.address, positionIds[i]);
            console.log(`Outcome ${i}: ${ethers.utils.formatUnits(balance, 6)} USDC`);
        }

        let totalFees = ethers.BigNumber.from(0);
        let tradeCount = 0;
        let volumeOutcome0 = ethers.BigNumber.from(0);
        let volumeOutcome1 = ethers.BigNumber.from(0);

        for (const trade of tradeAmounts) {
            await collateralToken.connect(trade.user).deposit({ value: trade.amount });
            await collateralToken.connect(trade.user).approve(fixedProductMarketMaker.address, trade.amount);

            const outcomeTokensToBuy = await fixedProductMarketMaker.calcBuyAmount(trade.amount, trade.outcomeIndex);
            const tx = await fixedProductMarketMaker.connect(trade.user).buy(trade.amount, trade.outcomeIndex, outcomeTokensToBuy);
            const receipt = await tx.wait();
            
            // Track volume per outcome
            if (trade.outcomeIndex === 0) {
                volumeOutcome0 = volumeOutcome0.add(trade.amount);
            } else {
                volumeOutcome1 = volumeOutcome1.add(trade.amount);
            }

            // Calculate fees for this trade
            const feeAmount = trade.amount.mul(feeFactor).div(ethers.utils.parseEther("1.0"));
            totalFees = totalFees.add(feeAmount);
            tradeCount++;

            // Log progress every 20 trades
            if (tradeCount % 20 === 0) {
                console.log(`\nAfter ${tradeCount} trades:`);
                console.log(`Total volume: ${ethers.utils.formatUnits(totalVolume, 6)} USDC`);
                console.log(`Volume outcome 0: ${ethers.utils.formatUnits(volumeOutcome0, 6)} USDC`);
                console.log(`Volume outcome 1: ${ethers.utils.formatUnits(volumeOutcome1, 6)} USDC`);
                console.log(`Total fees collected: ${ethers.utils.formatUnits(totalFees, 6)} USDC`);
                for (let i = 0; i < positionIds.length; i++) {
                    const balance = await conditionalTokens.balanceOf(fixedProductMarketMaker.address, positionIds[i]);
                    console.log(`Outcome ${i} pool: ${ethers.utils.formatUnits(balance, 6)} USDC`);
                }
            }
        }

        // Withdraw fees before removing funding
        console.log("\nWithdrawing fees...");
        await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
        const feesWithdrawn = await collateralToken.balanceOf(investor1.address);
        console.log(`Fees withdrawn to investor1: ${ethers.utils.formatUnits(feesWithdrawn, 6)} USDC`);

        // Resolve condition
        await conditionalTokens.connect(oracle).reportPayouts(questionId, reportPayoutsAr);

        // Remove funding
        const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
        await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

        const indexSet = 1 << winningIndex;

        // Redeem collateral from winner CT
        const tx = await conditionalTokens.connect(investor1).redeemPositions(
            collateralToken.address, 
            ethers.constants.HashZero, 
            conditionId, 
            [indexSet]
        );

        await tx.wait();
        
        // Log final results
        const finalBalance = await collateralToken.balanceOf(investor1.address);
        console.log("\nFinal Results:");
        console.log("Initial funding amount:", ethers.utils.formatUnits(addedFunds1, 6), "USDC");
        console.log("Final balance after removing funding and redeeming:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
        console.log("Difference:", ethers.utils.formatUnits(finalBalance.sub(addedFunds1), 6), "USDC");
        console.log("\nTrading Summary:");
        console.log("Total trades executed:", tradeCount);
        console.log("Total trading volume:", ethers.utils.formatUnits(totalVolume, 6), "USDC");
        console.log("Volume outcome 0:", ethers.utils.formatUnits(volumeOutcome0, 6), "USDC");
        console.log("Volume outcome 1:", ethers.utils.formatUnits(volumeOutcome1, 6), "USDC");
        console.log("Total fees collected:", ethers.utils.formatUnits(totalFees, 6), "USDC");
        console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        
        // Log fee pool information
        const feePoolWeight = await fixedProductMarketMaker.getFeePoolWeight();
        console.log("Remaining fee pool weight:", ethers.utils.formatUnits(feePoolWeight, 6), "USDC");
    });
});