const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
    getConditionId,
    getPositionId,
    getCollectionId
} = require('./helpers/id-helpers.js');
const { randomHex } = require('./helpers/utils.js');

describe('FixedProductMarketMaker', function() {
    let creator, oracle, investor1, trader, investor2;
    const questionId = randomHex(32);
    const numOutcomes = 64;
    let conditionId;
    let collectionIds;

    let conditionalTokens;
    let collateralToken;
    let fixedProductMarketMakerFactory;
    let positionIds;
    let fixedProductMarketMaker;
    const feeFactor = ethers.utils.parseEther("0.003"); // 0.3%
    let marketMakerPool;

    before(async function() {
        [, creator, oracle, investor1, trader, investor2] = await ethers.getSigners();
        
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
    });

    it('can be created by factory', async function() {
        await conditionalTokens.prepareCondition(oracle.address, questionId, numOutcomes);
        
        const createArgs = [
            conditionalTokens.address,
            collateralToken.address,
            [conditionId],
            feeFactor
        ];

        const fixedProductMarketMakerAddress = await fixedProductMarketMakerFactory
            .connect(creator)
            .callStatic
            .createFixedProductMarketMaker(...createArgs);

        const createTx = await fixedProductMarketMakerFactory
            .connect(creator)
            .createFixedProductMarketMaker(...createArgs);

        await expect(createTx)
            .to.emit(fixedProductMarketMakerFactory, 'FixedProductMarketMakerCreation')
            .withArgs(
                creator.address,
                fixedProductMarketMakerAddress,
                conditionalTokens.address,
                collateralToken.address,
                [conditionId],
                feeFactor
            );

        fixedProductMarketMaker = await ethers.getContractAt(
            "FixedProductMarketMaker",
            fixedProductMarketMakerAddress
        );
    });

    const addedFunds1 = ethers.utils.parseEther("10.0");
    const initialDistribution = [];
    const expectedFundedAmounts = new Array(64).fill(addedFunds1);

    it('can be funded', async function() {
        await collateralToken.connect(investor1).deposit({ value: addedFunds1 });
        await collateralToken.connect(investor1).approve(fixedProductMarketMaker.address, addedFunds1);
        
        const fundingTx = await fixedProductMarketMaker
            .connect(investor1)
            .addFunding(addedFunds1, initialDistribution);

        const fundingReceipt = await fundingTx.wait();
        const fundingEvent = fundingReceipt.events.find(
            e => e.event && e.event === 'FPMMFundingAdded'
        );
        expect(fundingEvent.args.funder).to.equal(investor1.address);
        expect(fundingEvent.args.sharesMinted).to.equal(addedFunds1);

        const amountsAdded = fundingEvent.args.amountsAdded;
        expect(amountsAdded.length).to.equal(expectedFundedAmounts.length);
        
        for (let i = 0; i < amountsAdded.length; i++) {
            expect(amountsAdded[i]).to.equal(expectedFundedAmounts[i]);
        }

        expect(await collateralToken.balanceOf(investor1.address)).to.equal(0);
        expect(await fixedProductMarketMaker.balanceOf(investor1.address)).to.equal(addedFunds1);

        for(let i = 0; i < positionIds.length; i++) {
            expect(await conditionalTokens.balanceOf(fixedProductMarketMaker.address, positionIds[i]))
                .to.equal(expectedFundedAmounts[i]);
            expect(await conditionalTokens.balanceOf(investor1.address, positionIds[i]))
                .to.equal(addedFunds1.sub(expectedFundedAmounts[i]));
        }
    });

    it('can buy tokens from it', async function() {
        const investmentAmount = ethers.utils.parseEther("1.0");
        const buyOutcomeIndex = 1;
        
        await collateralToken.connect(trader).deposit({ value: investmentAmount });
        await collateralToken.connect(trader).approve(fixedProductMarketMaker.address, investmentAmount);

        const feeAmount = investmentAmount.mul(feeFactor).div(ethers.utils.parseEther("1.0"));
        const outcomeTokensToBuy = await fixedProductMarketMaker.calcBuyAmount(investmentAmount, buyOutcomeIndex);

        await fixedProductMarketMaker.connect(trader).buy(investmentAmount, buyOutcomeIndex, outcomeTokensToBuy);

        expect(await collateralToken.balanceOf(trader.address)).to.equal(0);
        expect(await fixedProductMarketMaker.balanceOf(trader.address)).to.equal(0);

        marketMakerPool = [];
        for(let i = 0; i < positionIds.length; i++) {
            let newMarketMakerBalance;
            if(i === buyOutcomeIndex) {
                newMarketMakerBalance = expectedFundedAmounts[i]
                    .add(investmentAmount)
                    .sub(feeAmount)
                    .sub(outcomeTokensToBuy);
                expect(await conditionalTokens.balanceOf(trader.address, positionIds[i]))
                    .to.equal(outcomeTokensToBuy);
            } else {
                newMarketMakerBalance = expectedFundedAmounts[i]
                    .add(investmentAmount)
                    .sub(feeAmount);
                expect(await conditionalTokens.balanceOf(trader.address, positionIds[i]))
                    .to.equal(0);
            }
            expect(await conditionalTokens.balanceOf(fixedProductMarketMaker.address, positionIds[i]))
                .to.equal(newMarketMakerBalance);
            marketMakerPool[i] = newMarketMakerBalance;
        }
    });

    it('can sell tokens to it', async function() {
        const returnAmount = ethers.utils.parseEther("0.5");
        const sellOutcomeIndex = 1;
        
        await conditionalTokens.connect(trader).setApprovalForAll(fixedProductMarketMaker.address, true);

        const feeAmount = returnAmount.mul(feeFactor).div(
            ethers.utils.parseEther("1.0").sub(feeFactor)
        );

        const outcomeTokensToSell = await fixedProductMarketMaker.calcSellAmount(returnAmount, sellOutcomeIndex);

        await fixedProductMarketMaker.connect(trader).sell(returnAmount, sellOutcomeIndex, outcomeTokensToSell);

        expect(await collateralToken.balanceOf(trader.address)).to.equal(returnAmount);
        expect(await fixedProductMarketMaker.balanceOf(trader.address)).to.equal(0);

        for(let i = 0; i < positionIds.length; i++) {
            let newMarketMakerBalance;
            if(i === sellOutcomeIndex) {
                newMarketMakerBalance = marketMakerPool[i]
                    .sub(returnAmount)
                    .sub(feeAmount)
                    .add(outcomeTokensToSell);
            } else {
                newMarketMakerBalance = marketMakerPool[i]
                    .sub(returnAmount)
                    .sub(feeAmount);
            }
            expect(await conditionalTokens.balanceOf(fixedProductMarketMaker.address, positionIds[i]))
                .to.equal(newMarketMakerBalance);
            marketMakerPool[i] = newMarketMakerBalance;
        }
    });

    const addedFunds2 = ethers.utils.parseEther("5.0");
    it('can continue being funded', async function() {
        await collateralToken.connect(investor2).deposit({ value: addedFunds2 });
        await collateralToken.connect(investor2).approve(fixedProductMarketMaker.address, addedFunds2);
        await fixedProductMarketMaker.connect(investor2).addFunding(addedFunds2, []);

        expect(await collateralToken.balanceOf(investor2.address)).to.equal(0);
        expect(await fixedProductMarketMaker.balanceOf(investor2.address)).to.be.gt(0);

        for(let i = 0; i < positionIds.length; i++) {
            const newMarketMakerBalance = await conditionalTokens.balanceOf(
                fixedProductMarketMaker.address,
                positionIds[i]
            );
            expect(newMarketMakerBalance).to.be.gt(marketMakerPool[i]);
            expect(newMarketMakerBalance).to.be.lte(marketMakerPool[i].add(addedFunds2));
            marketMakerPool[i] = newMarketMakerBalance;

            const investor2Balance = await conditionalTokens.balanceOf(investor2.address, positionIds[i]);
            expect(investor2Balance).to.be.gte(0);
            expect(investor2Balance).to.be.lt(addedFunds2);
        }
    });

    const burnedShares1 = ethers.utils.parseEther("5.0");
    it('can be defunded', async function() {
        await fixedProductMarketMaker.connect(investor1).removeFunding(burnedShares1);

        expect(await collateralToken.balanceOf(investor1.address)).to.be.gt(0);
        expect(await fixedProductMarketMaker.balanceOf(investor1.address))
            .to.equal(addedFunds1.sub(burnedShares1));

        for(let i = 0; i < positionIds.length; i++) {
            const newMarketMakerBalance = await conditionalTokens.balanceOf(
                fixedProductMarketMaker.address,
                positionIds[i]
            );
            expect(newMarketMakerBalance).to.be.lt(marketMakerPool[i]);
            
            const expectedInvestor1Balance = addedFunds1
                .sub(expectedFundedAmounts[i])
                .add(marketMakerPool[i])
                .sub(newMarketMakerBalance);
                
            expect(await conditionalTokens.balanceOf(investor1.address, positionIds[i]))
                .to.equal(expectedInvestor1Balance);

            marketMakerPool[i] = newMarketMakerBalance;
        }
    });
});