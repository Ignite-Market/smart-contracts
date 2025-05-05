const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
    getConditionId,
    getPositionId,
    getCollectionId
} = require('./helpers/id-helpers.js');
const { randomHex } = require('./helpers/utils.js');

describe('FixedProductMarketMakerScenarios', function() {
    let creator, oracle, investor1, trader, investor2, treasury;
    const questionId = randomHex(32);
    const numOutcomes = 2;
    let conditionId;
    let collectionIds;

    let conditionalTokens;
    let collateralToken;
    let fixedProductMarketMakerFactory;
    let positionIds;
    let fixedProductMarketMaker;
    const feeFactor = ethers.utils.parseEther("0.02"); // 2%
    const treasuryPercent = 1000; // 10%
    const fundingThreshold = ethers.utils.parseUnits("100", 6); // 100 USDC
    let marketMakerPool;
    const DAY = 60 * 60 * 24;
    let endTime;

    // Helper function to generate trades based on parameters
    const generateTrades = async (params) => {
        const {
            targetVolume,
            outcomeSplit, // e.g. 0.7 for 70% outcome 1
            maxTradeSizePercent, // max trade size as percentage of funding
            funding
        } = params;

        console.log("\nTrade Generation Parameters:");
        console.log("Target Volume:", ethers.utils.formatUnits(targetVolume, 6), "USDC");
        console.log("Outcome Split:", outcomeSplit);
        console.log("Max Trade Size %:", maxTradeSizePercent);
        console.log("Funding Amount:", ethers.utils.formatUnits(funding, 6), "USDC");

        const tradeAmounts = [];
        let totalVolume = ethers.BigNumber.from(0);
        const maxTradeSize = funding.mul(maxTradeSizePercent).div(100);

        console.log("Max Trade Size:", ethers.utils.formatUnits(maxTradeSize, 6), "USDC");

        const generateTradeAmount = () => {
            const random = Math.random();
            let percentage;
            if (random < 0.6) {
                // 60% chance of trades between 2-5% of max trade size
                percentage = Math.floor(Math.random() * 3 + 2);
            } else if (random < 0.8) {
                // 20% chance of trades between 1-2% of max trade size
                percentage = Math.floor(Math.random() * 1 + 1);
            } else if (random < 0.95) {
                // 15% chance of trades between 5-8% of max trade size
                percentage = Math.floor(Math.random() * 3 + 5);
            } else {
                // 5% chance of large trades between 8-10% of max trade size
                percentage = Math.floor(Math.random() * 2 + 8);
            }
            
            // Calculate amount as percentage of funding, ensuring we maintain 6 decimal precision
            const amount = funding.mul(percentage).div(100);
            return amount;
        };

        let tradeCount = 0;
        while (totalVolume.lt(targetVolume)) {
            const amount = generateTradeAmount();
            const outcomeIndex = Math.random() < outcomeSplit ? 1 : 0;
            const user = Math.random() < 0.5 ? trader : investor2;
            
            tradeAmounts.push({
                amount,
                outcomeIndex,
                user
            });
            
            totalVolume = totalVolume.add(amount);
            tradeCount++;
        }

        console.log("\nTrade Generation Complete:");
        console.log("Total trades generated:", tradeCount);
        console.log("Final total volume:", ethers.utils.formatUnits(totalVolume, 6), "USDC");

        return tradeAmounts;
    };

    // Helper function to execute trades
    const executeTrades = async (trades) => {
        let totalFees = ethers.BigNumber.from(0);
        let tradeCount = 0;
        let volumeOutcome0 = ethers.BigNumber.from(0);
        let volumeOutcome1 = ethers.BigNumber.from(0);

        for (const trade of trades) {
            await collateralToken.connect(trade.user).deposit({ value: trade.amount });
            await collateralToken.connect(trade.user).approve(fixedProductMarketMaker.address, trade.amount);

            const outcomeTokensToBuy = await fixedProductMarketMaker.calcBuyAmount(trade.amount, trade.outcomeIndex);
            const tx = await fixedProductMarketMaker.connect(trade.user).buy(trade.amount, trade.outcomeIndex, outcomeTokensToBuy);
            const receipt = await tx.wait();
            
            if (trade.outcomeIndex === 0) {
                volumeOutcome0 = volumeOutcome0.add(trade.amount);
            } else {
                volumeOutcome1 = volumeOutcome1.add(trade.amount);
            }

            const feeAmount = trade.amount.mul(feeFactor).div(ethers.utils.parseEther("1.0"));
            totalFees = totalFees.add(feeAmount);
            tradeCount++;
        }

        return {
            totalFees,
            tradeCount,
            volumeOutcome0,
            volumeOutcome1
        };
    };

    // Helper function to setup market
    const setupMarket = async (funding, initialDistribution, feeFactor) => {
        await conditionalTokens.prepareCondition(oracle.address, questionId, numOutcomes);

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

        await collateralToken.connect(investor1).deposit({ value: funding });
        await collateralToken.connect(investor1).approve(fixedProductMarketMaker.address, funding);
        await fixedProductMarketMaker.connect(investor1).addFunding(funding, initialDistribution);
    };

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

    // Test scenarios for different funding amounts
    describe('Different Funding Amounts', function() {
        it('should handle $500 funding with $10k volume', async function() {
            const funding = ethers.utils.parseUnits("500", 6);
            const initialDistribution = [
                ethers.utils.parseUnits("250", 6),
                ethers.utils.parseUnits("250", 6)
            ];

            await setupMarket(funding, initialDistribution, feeFactor);

            const trades = await generateTrades({
                targetVolume: ethers.utils.parseUnits("10000", 6),
                outcomeSplit: 0.5,
                maxTradeSizePercent: 10,
                funding
            });

            const tradeResults = await executeTrades(trades);

            // Withdraw fees
            await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
            const feesWithdrawn = await collateralToken.balanceOf(investor1.address);

            // Resolve condition
            await conditionalTokens.connect(oracle).reportPayouts(questionId, [1,0]);

            // Remove funding
            const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
            await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

            // Redeem collateral
            const indexSet = 1 << 0;
            await conditionalTokens.connect(investor1).redeemPositions(
                collateralToken.address, 
                ethers.constants.HashZero, 
                conditionId, 
                [indexSet]
            );

            // Log results
            const finalBalance = await collateralToken.balanceOf(investor1.address);
            console.log("\nResults for $500 funding:");
            console.log("Initial funding:", ethers.utils.formatUnits(funding, 6), "USDC");
            console.log("Final balance:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
            console.log("Total trades:", tradeResults.tradeCount);
            console.log("Total volume:", ethers.utils.formatUnits(tradeResults.volumeOutcome0.add(tradeResults.volumeOutcome1), 6), "USDC");
            console.log("Fees collected:", ethers.utils.formatUnits(tradeResults.totalFees, 6), "USDC");
            console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        });

        it('should handle $1000 funding with $10k volume', async function() {
            const funding = ethers.utils.parseUnits("1000", 6);
            const initialDistribution = [
                ethers.utils.parseUnits("500", 6),
                ethers.utils.parseUnits("500", 6)
            ];

            await setupMarket(funding, initialDistribution, feeFactor);

            const trades = await generateTrades({
                targetVolume: ethers.utils.parseUnits("10000", 6),
                outcomeSplit: 0.5,
                maxTradeSizePercent: 10,
                funding
            });

            const tradeResults = await executeTrades(trades);

            // Withdraw fees
            await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
            const feesWithdrawn = await collateralToken.balanceOf(investor1.address);

            // Resolve condition
            await conditionalTokens.connect(oracle).reportPayouts(questionId, [1,0]);

            // Remove funding
            const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
            await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

            // Redeem collateral
            const indexSet = 1 << 0;
            await conditionalTokens.connect(investor1).redeemPositions(
                collateralToken.address, 
                ethers.constants.HashZero, 
                conditionId, 
                [indexSet]
            );

            // Log results
            const finalBalance = await collateralToken.balanceOf(investor1.address);
            console.log("\nResults for $1000 funding:");
            console.log("Initial funding:", ethers.utils.formatUnits(funding, 6), "USDC");
            console.log("Final balance:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
            console.log("Total trades:", tradeResults.tradeCount);
            console.log("Total volume:", ethers.utils.formatUnits(tradeResults.volumeOutcome0.add(tradeResults.volumeOutcome1), 6), "USDC");
            console.log("Fees collected:", ethers.utils.formatUnits(tradeResults.totalFees, 6), "USDC");
            console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        });

        it('should handle $2000 funding with $10k volume', async function() {
            const funding = ethers.utils.parseUnits("2000", 6);
            const initialDistribution = [
                ethers.utils.parseUnits("1000", 6),
                ethers.utils.parseUnits("1000", 6)
            ];

            await setupMarket(funding, initialDistribution, feeFactor);

            const trades = await generateTrades({
                targetVolume: ethers.utils.parseUnits("10000", 6),
                outcomeSplit: 0.5,
                maxTradeSizePercent: 10,
                funding
            });

            const tradeResults = await executeTrades(trades);

            // Withdraw fees
            await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
            const feesWithdrawn = await collateralToken.balanceOf(investor1.address);

            // Resolve condition
            await conditionalTokens.connect(oracle).reportPayouts(questionId, [1,0]);

            // Remove funding
            const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
            await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

            // Redeem collateral
            const indexSet = 1 << 0;
            await conditionalTokens.connect(investor1).redeemPositions(
                collateralToken.address, 
                ethers.constants.HashZero, 
                conditionId, 
                [indexSet]
            );

            // Log results
            const finalBalance = await collateralToken.balanceOf(investor1.address);
            console.log("\nResults for $2000 funding:");
            console.log("Initial funding:", ethers.utils.formatUnits(funding, 6), "USDC");
            console.log("Final balance:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
            console.log("Total trades:", tradeResults.tradeCount);
            console.log("Total volume:", ethers.utils.formatUnits(tradeResults.volumeOutcome0.add(tradeResults.volumeOutcome1), 6), "USDC");
            console.log("Fees collected:", ethers.utils.formatUnits(tradeResults.totalFees, 6), "USDC");
            console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        });
    });

    // Test scenarios for different outcome imbalances
    describe('Different Outcome Imbalances', function() {
        it('should handle 60/40 split with winning outcome', async function() {
            const funding = ethers.utils.parseUnits("1000", 6);
            const initialDistribution = [
                ethers.utils.parseUnits("500", 6),
                ethers.utils.parseUnits("500", 6)
            ];

            await setupMarket(funding, initialDistribution, feeFactor);

            const trades = await generateTrades({
                targetVolume: ethers.utils.parseUnits("10000", 6),
                outcomeSplit: 0.6,
                maxTradeSizePercent: 10,
                funding
            });

            const tradeResults = await executeTrades(trades);

            // Withdraw fees
            await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
            const feesWithdrawn = await collateralToken.balanceOf(investor1.address);

            // Resolve condition with outcome 1 winning (60% side)
            await conditionalTokens.connect(oracle).reportPayouts(questionId, [0,1]);

            // Remove funding
            const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
            await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

            // Redeem collateral
            const indexSet = 1 << 1;
            await conditionalTokens.connect(investor1).redeemPositions(
                collateralToken.address, 
                ethers.constants.HashZero, 
                conditionId, 
                [indexSet]
            );

            // Log results
            const finalBalance = await collateralToken.balanceOf(investor1.address);
            console.log("\nResults for 60/40 split (winning outcome):");
            console.log("Initial funding:", ethers.utils.formatUnits(funding, 6), "USDC");
            console.log("Final balance:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
            console.log("Total trades:", tradeResults.tradeCount);
            console.log("Total volume:", ethers.utils.formatUnits(tradeResults.volumeOutcome0.add(tradeResults.volumeOutcome1), 6), "USDC");
            console.log("Volume outcome 0:", ethers.utils.formatUnits(tradeResults.volumeOutcome0, 6), "USDC");
            console.log("Volume outcome 1:", ethers.utils.formatUnits(tradeResults.volumeOutcome1, 6), "USDC");
            console.log("Fees collected:", ethers.utils.formatUnits(tradeResults.totalFees, 6), "USDC");
            console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        });

        it('should handle 80/20 split with winning outcome', async function() {
            const funding = ethers.utils.parseUnits("1000", 6);
            const initialDistribution = [
                ethers.utils.parseUnits("500", 6),
                ethers.utils.parseUnits("500", 6)
            ];

            await setupMarket(funding, initialDistribution, feeFactor);

            const trades = await generateTrades({
                targetVolume: ethers.utils.parseUnits("10000", 6),
                outcomeSplit: 0.8,
                maxTradeSizePercent: 10,
                funding
            });

            const tradeResults = await executeTrades(trades);

            // Withdraw fees
            await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
            const feesWithdrawn = await collateralToken.balanceOf(investor1.address);

            // Resolve condition with outcome 1 winning (80% side)
            await conditionalTokens.connect(oracle).reportPayouts(questionId, [0,1]);

            // Remove funding
            const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
            await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

            // Redeem collateral
            const indexSet = 1 << 1;
            await conditionalTokens.connect(investor1).redeemPositions(
                collateralToken.address, 
                ethers.constants.HashZero, 
                conditionId, 
                [indexSet]
            );

            // Log results
            const finalBalance = await collateralToken.balanceOf(investor1.address);
            console.log("\nResults for 80/20 split (winning outcome):");
            console.log("Initial funding:", ethers.utils.formatUnits(funding, 6), "USDC");
            console.log("Final balance:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
            console.log("Total trades:", tradeResults.tradeCount);
            console.log("Total volume:", ethers.utils.formatUnits(tradeResults.volumeOutcome0.add(tradeResults.volumeOutcome1), 6), "USDC");
            console.log("Volume outcome 0:", ethers.utils.formatUnits(tradeResults.volumeOutcome0, 6), "USDC");
            console.log("Volume outcome 1:", ethers.utils.formatUnits(tradeResults.volumeOutcome1, 6), "USDC");
            console.log("Fees collected:", ethers.utils.formatUnits(tradeResults.totalFees, 6), "USDC");
            console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        });

        it('should handle 90/10 split with winning outcome', async function() {
            const funding = ethers.utils.parseUnits("1000", 6);
            const initialDistribution = [
                ethers.utils.parseUnits("500", 6),
                ethers.utils.parseUnits("500", 6)
            ];

            await setupMarket(funding, initialDistribution, feeFactor);

            const trades = await generateTrades({
                targetVolume: ethers.utils.parseUnits("10000", 6),
                outcomeSplit: 0.9,
                maxTradeSizePercent: 10,
                funding
            });

            const tradeResults = await executeTrades(trades);

            // Withdraw fees
            await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
            const feesWithdrawn = await collateralToken.balanceOf(investor1.address);

            // Resolve condition with outcome 1 winning (90% side)
            await conditionalTokens.connect(oracle).reportPayouts(questionId, [0,1]);

            // Remove funding
            const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
            await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

            // Redeem collateral
            const indexSet = 1 << 1;
            await conditionalTokens.connect(investor1).redeemPositions(
                collateralToken.address, 
                ethers.constants.HashZero, 
                conditionId, 
                [indexSet]
            );

            // Log results
            const finalBalance = await collateralToken.balanceOf(investor1.address);
            console.log("\nResults for 90/10 split (winning outcome):");
            console.log("Initial funding:", ethers.utils.formatUnits(funding, 6), "USDC");
            console.log("Final balance:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
            console.log("Total trades:", tradeResults.tradeCount);
            console.log("Total volume:", ethers.utils.formatUnits(tradeResults.volumeOutcome0.add(tradeResults.volumeOutcome1), 6), "USDC");
            console.log("Volume outcome 0:", ethers.utils.formatUnits(tradeResults.volumeOutcome0, 6), "USDC");
            console.log("Volume outcome 1:", ethers.utils.formatUnits(tradeResults.volumeOutcome1, 6), "USDC");
            console.log("Fees collected:", ethers.utils.formatUnits(tradeResults.totalFees, 6), "USDC");
            console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        });
    });

    // Test scenarios for different volumes
    describe('Different Volumes', function() {
        it('should handle $5k volume', async function() {
            const funding = ethers.utils.parseUnits("1000", 6);
            const initialDistribution = [
                ethers.utils.parseUnits("500", 6),
                ethers.utils.parseUnits("500", 6)
            ];

            await setupMarket(funding, initialDistribution, feeFactor);

            const trades = await generateTrades({
                targetVolume: ethers.utils.parseUnits("5000", 6),
                outcomeSplit: 0.5,
                maxTradeSizePercent: 10,
                funding
            });

            const tradeResults = await executeTrades(trades);

            // Withdraw fees
            await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
            const feesWithdrawn = await collateralToken.balanceOf(investor1.address);

            // Resolve condition
            await conditionalTokens.connect(oracle).reportPayouts(questionId, [1,0]);

            // Remove funding
            const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
            await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

            // Redeem collateral
            const indexSet = 1 << 0;
            await conditionalTokens.connect(investor1).redeemPositions(
                collateralToken.address, 
                ethers.constants.HashZero, 
                conditionId, 
                [indexSet]
            );

            // Log results
            const finalBalance = await collateralToken.balanceOf(investor1.address);
            console.log("\nResults for $5k volume:");
            console.log("Initial funding:", ethers.utils.formatUnits(funding, 6), "USDC");
            console.log("Final balance:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
            console.log("Total trades:", tradeResults.tradeCount);
            console.log("Total volume:", ethers.utils.formatUnits(tradeResults.volumeOutcome0.add(tradeResults.volumeOutcome1), 6), "USDC");
            console.log("Fees collected:", ethers.utils.formatUnits(tradeResults.totalFees, 6), "USDC");
            console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        });

        it('should handle $20k volume', async function() {
            const funding = ethers.utils.parseUnits("1000", 6);
            const initialDistribution = [
                ethers.utils.parseUnits("500", 6),
                ethers.utils.parseUnits("500", 6)
            ];

            await setupMarket(funding, initialDistribution, feeFactor);

            const trades = await generateTrades({
                targetVolume: ethers.utils.parseUnits("20000", 6),
                outcomeSplit: 0.5,
                maxTradeSizePercent: 10,
                funding
            });

            const tradeResults = await executeTrades(trades);

            // Withdraw fees
            await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
            const feesWithdrawn = await collateralToken.balanceOf(investor1.address);

            // Resolve condition
            await conditionalTokens.connect(oracle).reportPayouts(questionId, [1,0]);

            // Remove funding
            const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
            await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

            // Redeem collateral
            const indexSet = 1 << 0;
            await conditionalTokens.connect(investor1).redeemPositions(
                collateralToken.address, 
                ethers.constants.HashZero, 
                conditionId, 
                [indexSet]
            );

            // Log results
            const finalBalance = await collateralToken.balanceOf(investor1.address);
            console.log("\nResults for $20k volume:");
            console.log("Initial funding:", ethers.utils.formatUnits(funding, 6), "USDC");
            console.log("Final balance:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
            console.log("Total trades:", tradeResults.tradeCount);
            console.log("Total volume:", ethers.utils.formatUnits(tradeResults.volumeOutcome0.add(tradeResults.volumeOutcome1), 6), "USDC");
            console.log("Fees collected:", ethers.utils.formatUnits(tradeResults.totalFees, 6), "USDC");
            console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        });
    });

    // Test scenarios for high volume with different funding configurations
    describe.only('High Volume Scenarios', function() {
        // Increase timeout for high volume scenarios
        this.timeout(240000); // 4 minutes timeout

        it('should handle 100k volume with 10k total funding (tracking 1k funder)', async function() {
            const totalFunding = ethers.utils.parseUnits("10000", 6);
            const trackedFunding = ethers.utils.parseUnits("1000", 6);
            const initialDistribution = [
                ethers.utils.parseUnits("5000", 6),
                ethers.utils.parseUnits("5000", 6)
            ];

            await setupMarket(totalFunding, initialDistribution, feeFactor);

            // Add additional funders
            const additionalFunding = ethers.utils.parseUnits("4500", 6);
            const otherFunding = ethers.utils.parseUnits("4500", 6);

            // Fund from investor2
            await collateralToken.connect(investor2).deposit({ value: additionalFunding });
            await collateralToken.connect(investor2).approve(fixedProductMarketMaker.address, additionalFunding);
            await fixedProductMarketMaker.connect(investor2).addFunding(additionalFunding, []);

            // Fund from trader
            await collateralToken.connect(trader).deposit({ value: otherFunding });
            await collateralToken.connect(trader).approve(fixedProductMarketMaker.address, otherFunding);
            await fixedProductMarketMaker.connect(trader).addFunding(otherFunding, []);

            // Get initial balance of tracked funder
            const initialBalance = await collateralToken.balanceOf(investor1.address);

            const trades = await generateTrades({
                targetVolume: ethers.utils.parseUnits("100000", 6),
                outcomeSplit: 0.7,
                maxTradeSizePercent: 10,
                funding: totalFunding
            });

            const tradeResults = await executeTrades(trades);

            // Calculate tracked funder's share of fees (10% of total fees since they provided 10% of funding)
            const trackedFunderFeeShare = tradeResults.totalFees.mul(10).div(100);

            // Withdraw fees for tracked funder (investor1)
            await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
            const feesWithdrawn = await collateralToken.balanceOf(investor1.address);

            // Resolve condition
            await conditionalTokens.connect(oracle).reportPayouts(questionId, [1,0]);

            // Remove funding for tracked funder
            const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
            await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

            // Redeem collateral for tracked funder
            const indexSet = 1 << 0;
            await conditionalTokens.connect(investor1).redeemPositions(
                collateralToken.address, 
                ethers.constants.HashZero, 
                conditionId, 
                [indexSet]
            );

            // Get final balance and calculate profit
            const finalBalance = await collateralToken.balanceOf(investor1.address);
            const profit = finalBalance.sub(initialBalance);

            // Log results for tracked funder
            console.log("\nResults for 1k funder in 100k volume market (10k total funding):");
            console.log("Initial funding:", ethers.utils.formatUnits(trackedFunding, 6), "USDC");
            console.log("Initial balance:", ethers.utils.formatUnits(initialBalance, 6), "USDC");
            console.log("Final balance:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
            console.log("Profit/Loss:", ethers.utils.formatUnits(profit, 6), "USDC");
            console.log("ROI:", ethers.utils.formatUnits(profit.mul(100).div(trackedFunding), 6), "%");
            console.log("Total trades:", tradeResults.tradeCount);
            console.log("Total volume:", ethers.utils.formatUnits(tradeResults.volumeOutcome0.add(tradeResults.volumeOutcome1), 6), "USDC");
            console.log("Tracked funder's share of fees:", ethers.utils.formatUnits(trackedFunderFeeShare, 6), "USDC");
            console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        });

        it('should handle 100k volume with 5k funding', async function() {
            const funding = ethers.utils.parseUnits("5000", 6);
            const initialDistribution = [
                ethers.utils.parseUnits("2500", 6),
                ethers.utils.parseUnits("2500", 6)
            ];

            await setupMarket(funding, initialDistribution, feeFactor);

            const trades = await generateTrades({
                targetVolume: ethers.utils.parseUnits("100000", 6),
                outcomeSplit: 0.35,
                maxTradeSizePercent: 10,
                funding
            });

            const tradeResults = await executeTrades(trades);

            // Withdraw fees
            await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
            const feesWithdrawn = await collateralToken.balanceOf(investor1.address);

            // Resolve condition
            await conditionalTokens.connect(oracle).reportPayouts(questionId, [1,0]);

            // Remove funding
            const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
            await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

            // Redeem collateral
            const indexSet = 1 << 0;
            await conditionalTokens.connect(investor1).redeemPositions(
                collateralToken.address, 
                ethers.constants.HashZero, 
                conditionId, 
                [indexSet]
            );

            // Log results
            const finalBalance = await collateralToken.balanceOf(investor1.address);
            console.log("\nResults for 100k volume with 5k funding:");
            console.log("Initial funding:", ethers.utils.formatUnits(funding, 6), "USDC");
            console.log("Final balance:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
            console.log("Total trades:", tradeResults.tradeCount);
            console.log("Total volume:", ethers.utils.formatUnits(tradeResults.volumeOutcome0.add(tradeResults.volumeOutcome1), 6), "USDC");
            console.log("Fees collected:", ethers.utils.formatUnits(tradeResults.totalFees, 6), "USDC");
            console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        });

        it.skip('should handle 100k volume with 1k funding', async function() {
            const funding = ethers.utils.parseUnits("1000", 6);
            const initialDistribution = [
                ethers.utils.parseUnits("500", 6),
                ethers.utils.parseUnits("500", 6)
            ];

            await setupMarket(funding, initialDistribution, feeFactor);

            const trades = await generateTrades({
                targetVolume: ethers.utils.parseUnits("100000", 6),
                outcomeSplit: 0.6,
                maxTradeSizePercent: 10,
                funding
            });

            const tradeResults = await executeTrades(trades);

            // Withdraw fees
            await fixedProductMarketMaker.connect(investor1).withdrawFees(investor1.address);
            const feesWithdrawn = await collateralToken.balanceOf(investor1.address);

            // Resolve condition
            await conditionalTokens.connect(oracle).reportPayouts(questionId, [1,0]);

            // Remove funding
            const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
            await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

            // Redeem collateral
            const indexSet = 1 << 0;
            await conditionalTokens.connect(investor1).redeemPositions(
                collateralToken.address, 
                ethers.constants.HashZero, 
                conditionId, 
                [indexSet]
            );

            // Log results
            const finalBalance = await collateralToken.balanceOf(investor1.address);
            console.log("\nResults for 100k volume with 1k funding:");
            console.log("Initial funding:", ethers.utils.formatUnits(funding, 6), "USDC");
            console.log("Final balance:", ethers.utils.formatUnits(finalBalance, 6), "USDC");
            console.log("Total trades:", tradeResults.tradeCount);
            console.log("Total volume:", ethers.utils.formatUnits(tradeResults.volumeOutcome0.add(tradeResults.volumeOutcome1), 6), "USDC");
            console.log("Fees collected:", ethers.utils.formatUnits(tradeResults.totalFees, 6), "USDC");
            console.log("Fees withdrawn:", ethers.utils.formatUnits(feesWithdrawn, 6), "USDC");
        });
    });

}); 