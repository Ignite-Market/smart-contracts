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
    const numOutcomes = 3; // 64 originally from gnosis tests
    let conditionId;
    let collectionIds;

    let conditionalTokens;
    let collateralToken;
    let fixedProductMarketMakerFactory;
    let positionIds;
    let fixedProductMarketMaker;
    const feeFactor = ethers.utils.parseEther("0.003"); // 0.3%
    const treasuryPercent = 100; // 1%
    let marketMakerPool;

    before(async function() {
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
    });

    it('can be created by factory', async function() {
        await conditionalTokens.prepareCondition(oracle.address, questionId, numOutcomes);
        
        const createArgs = [
            conditionalTokens.address,
            collateralToken.address,
            [conditionId],
            feeFactor,
            treasuryPercent,
            treasury.address
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
                feeFactor,
                treasuryPercent,
                treasury.address
            );

        fixedProductMarketMaker = await ethers.getContractAt(
            "FixedProductMarketMaker",
            fixedProductMarketMakerAddress
        );
    });

    const addedFunds1 = ethers.utils.parseEther("10.0");
    const initialDistribution = [];
    const expectedFundedAmounts = new Array(numOutcomes).fill(addedFunds1);

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

        // feeAmount (LP + treasuryFee)
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

        // collect fees
        const pendingFees = await fixedProductMarketMaker.feesWithdrawableBy(investor1.address);
        const treasuryFee = feeAmount.mul(treasuryPercent).div(10000);
        expect(pendingFees).to.equal(feeAmount.sub(treasuryFee));

        const tx = await fixedProductMarketMaker.withdrawFees(investor1.address);
        await tx.wait();

        // check if both investor1 + treasury collected expected fee
        expect(await collateralToken.balanceOf(treasury.address)).to.equal(treasuryFee);
        expect(await collateralToken.balanceOf(investor1.address)).to.equal(feeAmount.sub(treasuryFee));

        // check if withdrawable fee is now 0
        expect(await fixedProductMarketMaker.feesWithdrawableBy(investor1.address)).to.equal(0);
    });

    it('can sell tokens to it', async function() {
        const returnAmount = ethers.utils.parseEther("0.5");
        const sellOutcomeIndex = 1;

        await conditionalTokens.connect(trader).setApprovalForAll(fixedProductMarketMaker.address, true);

        const feeAmount = returnAmount.mul(feeFactor).div(
            ethers.utils.parseEther("1.0").sub(feeFactor)
        );

        const outcomeTokensToSell = await fixedProductMarketMaker.calcSellAmount(returnAmount, sellOutcomeIndex);

        // calc of shares
        const posIds = [
            await fixedProductMarketMaker.positionIds(0),
            await fixedProductMarketMaker.positionIds(1),
            await fixedProductMarketMaker.positionIds(2),
        ]

        const marketSharesAmounts = await conditionalTokens.balanceOfBatch(
            [fixedProductMarketMaker.address,fixedProductMarketMaker.address,fixedProductMarketMaker.address], 
            posIds
        );

        const amountOfCollateralToReceive = calcSellAmountInCollateral(
            outcomeTokensToSell,
            marketSharesAmounts,
            sellOutcomeIndex,
            "0.003" // feeFactor
        );

        // almost the same, due to rounding
        expect(amountOfCollateralToReceive).to.be.closeTo(returnAmount, 1);

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

        // await conditionalTokens.me
    });
});

const Big = require('big.js');
const { newtonRaphson } = require('@fvictorio/newton-raphson-method');

function calcSellAmountInCollateral(
    sharesToSellAmount,
    marketSharesAmounts,
    sellingOutcomeIndex,
    marketFee
  ) {
    Big.DP = 90;
  
    const marketSellingSharesAmounts = new Big(marketSharesAmounts[sellingOutcomeIndex]);
    const marketNonSellingSharesAmounts = marketSharesAmounts
      .filter((_, index) => index !== sellingOutcomeIndex)
      .map(marketShares => new Big(marketShares));
    const sharesToSell = new Big(sharesToSellAmount);
  
    const f = (r) => {
      /* For three outcomes, where the `x` is the one being sold, the formula is:
       * f(r) = ((y - R) * (z - R)) * (x  + a - R) - (x * y * z)
       * where:
       *   `R` is r / (1 - fee)
       *   `x`, `y`, `z` are the market maker shares for each outcome, where `x` is the market maker share being sold
       *   `a` is the amount of outcomes shares that are being sold
       *   `r` (the unknown) is the amount of collateral that will be returned in exchange of `a` tokens
       */
  
      const R = r.div(1 - marketFee);
  
      // ((y - R) * (z - R))
      const firstTerm = marketNonSellingSharesAmounts
        .map(h => h.minus(R))
        .reduce((a, b) => a.mul(b));
  
      // (x  + a - R)
      const secondTerm = marketSellingSharesAmounts.plus(sharesToSell).minus(R);
  
      // (x * y * z)
      const thirdTerm = marketNonSellingSharesAmounts.reduce(
        (a, b) => a.mul(b),
        marketSellingSharesAmounts
      );
  
      // ((y - R) * (z - R)) * (x  + a - R) - (x * y * z)
      return firstTerm.mul(secondTerm).minus(thirdTerm);
    };
  
    /* Newton-Raphson method is used to find the root of a function.
     * Root of a function is the point where the function touches the x-axis on a graph.
     * In this case y-axis is the number of outcome tokens / shares.
     * The x-axis is the number of colleral tokens to be received.
     * This meaning we want to know how much collateral we need to receive to have 0 outcome tokens / shares.
     */
    const r = newtonRaphson(f, 0, { maxIterations: 100 });
  
    if (!r) {
      return null;
    }
  
    return BigInt(r.toFixed(0));
  };