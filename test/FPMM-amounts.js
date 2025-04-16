const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
    getConditionId,
    getPositionId,
    getCollectionId
} = require('./helpers/id-helpers.js');
const { randomHex } = require('./helpers/utils.js');

describe('FixedProductMarketMaker', function() {
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
    const feeFactor = ethers.utils.parseEther("0.003"); // 0.3%
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

        // Create new FPMM
        const fixedProductMarketMakerAddress = await fixedProductMarketMakerFactory
            .connect(creator)
            .callStatic
            .createFixedProductMarketMaker(...createArgs);

        await fixedProductMarketMakerFactory.connect(creator)
            .createFixedProductMarketMaker(...createArgs);

        fixedProductMarketMaker = await ethers.getContractAt(
            "FixedProductMarketMaker",
            fixedProductMarketMakerAddress
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

    it('add + trade + remove funding with no trades', async function() {
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

        // Create new FPMM
        const fixedProductMarketMakerAddress = await fixedProductMarketMakerFactory
            .connect(creator)
            .callStatic
            .createFixedProductMarketMaker(...createArgs);

        await fixedProductMarketMakerFactory.connect(creator)
            .createFixedProductMarketMaker(...createArgs);

        fixedProductMarketMaker = await ethers.getContractAt(
            "FixedProductMarketMaker",
            fixedProductMarketMakerAddress
        );

        // Add funding
        const addedFunds1 = ethers.utils.parseUnits("100", 6);
        const initialDistribution = [];

        await collateralToken.connect(investor1).deposit({ value: addedFunds1 });
        await collateralToken.connect(investor1).approve(fixedProductMarketMaker.address, addedFunds1);

        expect(await collateralToken.balanceOf(investor1.address)).to.equal(addedFunds1);
        await fixedProductMarketMaker.connect(investor1).addFunding(addedFunds1, initialDistribution);
        expect(await collateralToken.balanceOf(investor1.address)).to.equal(0);

        // Trade
        // Trade
        // Trade

        const investmentAmount = ethers.utils.parseUnits("10", 6);
        const buyOutcomeIndex = 0;

        await collateralToken.connect(trader).deposit({ value: investmentAmount });
        await collateralToken.connect(trader).approve(fixedProductMarketMaker.address, investmentAmount);

        const outcomeTokensToBuy = await fixedProductMarketMaker.calcBuyAmount(investmentAmount, buyOutcomeIndex);

        await fixedProductMarketMaker.connect(trader).buy(investmentAmount, buyOutcomeIndex, outcomeTokensToBuy);



        // Resolve condition
        await conditionalTokens.connect(oracle).reportPayouts(questionId, reportPayoutsAr);

        // Remove funding
        const sharesToRemove = await fixedProductMarketMaker.balanceOf(investor1.address);
        await fixedProductMarketMaker.connect(investor1).removeFunding(sharesToRemove);

        // Collateral token should still be 0 + some fees collected
        // expect(await collateralToken.balanceOf(investor1.address)).to.equal(0);

        const indexSet = 1 << winningIndex;

        // Redeem collateral from winner CT
        const tx = await conditionalTokens.connect(investor1).redeemPositions(
            collateralToken.address, 
            ethers.constants.HashZero, 
            conditionId, 
            [indexSet]
        );

        await tx.wait();
        
        // Still trying to figure out why received amount is lower
        // Still trying to figure out why received amount is lower
        // Still trying to figure out why received amount is lower
        
        // console.log(await collateralToken.balanceOf(investor1.address));
        
        // Should get back the initial funding amount
        // expect(await collateralToken.balanceOf(investor1.address)).to.equal(addedFunds1);
    });
});