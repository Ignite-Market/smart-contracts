const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getConditionId, getPositionId, getCollectionId } = require("./helpers/id-helpers.js");
const { randomHex } = require("./helpers/utils.js");

describe("FPMM Full Lifecycle", function () {
  let owner, oracle, user1, user2, treasury;
  let collateralToken, conditionalTokens, factory, fpmm;
  let conditionId, collectionIds, positionIds;
  const questionId = randomHex(32);
  const numOutcomes = 3;
  const feeFactor = ethers.utils.parseEther("0.003");
  const ONE = ethers.BigNumber.from("10").pow(18);
  const treasuryPercent = 100; // 1%
  const fundingThreshold = ethers.utils.parseUnits("100", 6);
  const endTime = Math.floor(Date.now() / 1000) + 86400;

  before(async () => {
    [owner, oracle, user1, user2, treasury] = await ethers.getSigners();

    conditionId = getConditionId(oracle.address, questionId, numOutcomes);
    collectionIds = Array.from(
      { length: numOutcomes },
      (_, i) => getCollectionId(conditionId, BigInt(1) << BigInt(i))
    );

    const Collateral = await ethers.getContractFactory("MockCoin");
    const Conditional = await ethers.getContractFactory("ConditionalTokens");
    const Factory = await ethers.getContractFactory("FixedProductMarketMakerFactory");

    factory = await Factory.deploy();
    await factory.deployed();
    collateralToken = await Collateral.deploy();
    conditionalTokens = await Conditional.deploy(factory.address);

    positionIds = collectionIds.map(cid => getPositionId(collateralToken.address, cid));

    await conditionalTokens.setOracle(oracle.address, true);

    await conditionalTokens.connect(oracle).prepareCondition(oracle.address, questionId, numOutcomes);

    const salt = ethers.utils.hexlify(ethers.utils.randomBytes(32));

    const tx = await factory.createFixedProductMarketMaker(
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
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === "FixedProductMarketMakerCreation");
    fpmm = await ethers.getContractAt("FixedProductMarketMaker", event.args.fixedProductMarketMaker);
    console.log("owner", owner.address);
    console.log("fpmm creator", await fpmm.creator());
    await fpmm.connect(owner).finalizeSetup();
  });

  it("can complete a full lifecycle", async () => {
    const fund1 = ethers.utils.parseUnits("100", 6);
    const fund2 = ethers.utils.parseUnits("50", 6);
    const buyAmount = ethers.utils.parseUnits("10", 6);
    const sellOutcomeIndex = 1;

    // Fund user1
    await collateralToken.connect(user1).deposit({ value: fund1 });
    await collateralToken.connect(user1).approve(fpmm.address, fund1);
    await fpmm.connect(user1).addFunding(fund1, []);
    
    // Verify liquidity after user1's funding
    const liquidityAfterUser1 = fund1;
    expect(await fpmm.currentLiquidity()).to.equal(liquidityAfterUser1);

    // Fund user2
    await collateralToken.connect(user2).deposit({ value: fund2 });
    await collateralToken.connect(user2).approve(fpmm.address, fund2);
    await fpmm.connect(user2).addFunding(fund2, []);

    // Verify liquidity after user2's funding
    const liquidityAfterUser2 = liquidityAfterUser1.add(fund2);
    expect(await fpmm.currentLiquidity()).to.equal(liquidityAfterUser2);

    // User1 buys tokens
    await collateralToken.connect(user1).deposit({ value: buyAmount });
    await collateralToken.connect(user1).approve(fpmm.address, buyAmount);

    // Get initial fee pool weight
    const initialFeePoolWeight = await fpmm.getFeePoolWeight();

    const maxBuy = await fpmm.calcBuyAmount(buyAmount, sellOutcomeIndex);
    await fpmm.connect(user1).buy(buyAmount, sellOutcomeIndex, maxBuy);

    // Verify liquidity after buy
    const buyFee = buyAmount.mul(feeFactor).div(ONE);
    const liquidityAfterBuy = liquidityAfterUser2.add(buyAmount.sub(buyFee));
    expect(await fpmm.currentLiquidity()).to.equal(liquidityAfterBuy);

    const traderTokenBalance = await conditionalTokens.balanceOf(user1.address, positionIds[sellOutcomeIndex]);
    const returnAmount = ethers.utils.parseUnits("5", 6);

    await conditionalTokens.connect(user1).setApprovalForAll(fpmm.address, true);
    const tokensToSell = await fpmm.calcSellAmount(returnAmount, sellOutcomeIndex);
    expect(traderTokenBalance).to.be.gte(tokensToSell);
    await fpmm.connect(user1).sell(returnAmount, sellOutcomeIndex, tokensToSell);

    // Calculate sell fee in wei
    const sellFee = returnAmount.mul(feeFactor).div(ONE.sub(feeFactor));
    
    // Verify liquidity after sell
    const liquidityAfterSell = liquidityAfterBuy.sub(returnAmount);
    expect(await fpmm.currentLiquidity()).to.equal(liquidityAfterSell);

    // Get fee pool weight after trades
    const afterTradesFeePoolWeight = await fpmm.getFeePoolWeight();
    
    // Verify fees were added to pool
    expect(afterTradesFeePoolWeight.sub(initialFeePoolWeight)).to.be.closeTo(buyFee.add(sellFee), 1000);

    await conditionalTokens.connect(oracle).reportPayouts(questionId, [1, 0, 0]);

    // Get user2's share of total supply
    const user2Shares = await fpmm.balanceOf(user2.address);
    const totalSupply = await fpmm.totalSupply();
    
    // Calculate expected fees for user2 based on their share of total supply
    const feePoolIncrease = afterTradesFeePoolWeight.sub(initialFeePoolWeight);
    const expectedUser2Fees = feePoolIncrease.mul(user2Shares).div(totalSupply);
    const expectedTreasuryFees = expectedUser2Fees.mul(treasuryPercent).div(10000);
    const expectedUser2NetFees = expectedUser2Fees.sub(expectedTreasuryFees);

    // Get initial balances
    const initialUser2Balance = await collateralToken.balanceOf(user2.address);
    const initialTreasuryBalance = await collateralToken.balanceOf(treasury.address);

    // Get initial withdrawn fees for user2
    const initialWithdrawnFees = await fpmm.feesWithdrawableBy(user2.address);

    // Get total supply before removal
    const totalSupplyBeforeRemoval = await fpmm.totalSupply();

    // Remove funding and withdraw fees
    await fpmm.connect(user2).removeFunding(user2Shares);

    // Verify liquidity after removing funding
    const liquidityRemoved = liquidityAfterSell.mul(user2Shares).div(totalSupplyBeforeRemoval);
    const liquidityAfterRemoval = liquidityAfterSell.sub(liquidityRemoved);
    expect(await fpmm.currentLiquidity()).to.equal(liquidityAfterRemoval);

    // Verify fee distribution
    const finalUser2Balance = await collateralToken.balanceOf(user2.address);
    const finalTreasuryBalance = await collateralToken.balanceOf(treasury.address);


    // Check that user2 received their share of fees
    const user2FeeReceived = finalUser2Balance.sub(initialUser2Balance);
    expect(user2FeeReceived).to.be.closeTo(expectedUser2NetFees, 1000);

    // Check that treasury received their share of fees
    const treasuryFeeReceived = finalTreasuryBalance.sub(initialTreasuryBalance);
    expect(treasuryFeeReceived).to.be.closeTo(expectedTreasuryFees, 1000);

    // Verify fee pool weight is updated
    const finalFeePoolWeight = await fpmm.getFeePoolWeight();
    expect(finalFeePoolWeight).to.be.lt(afterTradesFeePoolWeight);

    // Verify withdrawn fees are updated
    const finalWithdrawnFees = await fpmm.feesWithdrawableBy(user2.address);
    expect(finalWithdrawnFees).to.equal(0);

    // Add a test to verify that withdrawing again doesn't give more fees
    await fpmm.withdrawFees(user2.address);
    const balanceAfterSecondWithdraw = await collateralToken.balanceOf(user2.address);
    expect(balanceAfterSecondWithdraw).to.equal(finalUser2Balance);

    // Add a test to verify that the total fees received match the initial withdrawable fees
    expect(user2FeeReceived).to.equal(initialWithdrawnFees);

    await conditionalTokens.connect(user2).redeemPositions(
      collateralToken.address,
      ethers.constants.HashZero,
      conditionId,
      [1, 2, 4]
    );

    const bal = await collateralToken.balanceOf(user2.address);
    expect(bal).to.be.gt(0);
  });
});
