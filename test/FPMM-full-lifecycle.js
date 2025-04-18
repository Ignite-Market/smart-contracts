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

    collateralToken = await Collateral.deploy();
    conditionalTokens = await Conditional.deploy();
    factory = await Factory.deploy();

    positionIds = collectionIds.map(cid => getPositionId(collateralToken.address, cid));

    await conditionalTokens.prepareCondition(oracle.address, questionId, numOutcomes);

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

    // Fund user2
    await collateralToken.connect(user2).deposit({ value: fund2 });
    await collateralToken.connect(user2).approve(fpmm.address, fund2);
    await fpmm.connect(user2).addFunding(fund2, []);

    // User1 buys tokens
    await collateralToken.connect(user1).deposit({ value: buyAmount });
    await collateralToken.connect(user1).approve(fpmm.address, buyAmount);

    const maxBuy = await fpmm.calcBuyAmount(buyAmount, sellOutcomeIndex);
    await fpmm.connect(user1).buy(buyAmount, sellOutcomeIndex, maxBuy);

    const traderTokenBalance = await conditionalTokens.balanceOf(user1.address, positionIds[sellOutcomeIndex]);
    const returnAmount = ethers.utils.parseUnits("5", 6);

    await conditionalTokens.connect(user1).setApprovalForAll(fpmm.address, true);
    const tokensToSell = await fpmm.calcSellAmount(returnAmount, sellOutcomeIndex);
    expect(traderTokenBalance).to.be.gte(tokensToSell);
    await fpmm.connect(user1).sell(returnAmount, sellOutcomeIndex, tokensToSell);

    await conditionalTokens.connect(oracle).reportPayouts(questionId, [1, 0, 0]);

    const shares = await fpmm.balanceOf(user2.address);
    await fpmm.connect(user2).removeFunding(shares);

    await conditionalTokens.connect(user2).redeemPositions(
      collateralToken.address,
      ethers.constants.HashZero,
      conditionId,
      [1, 2, 4]
    );

    const bal = await collateralToken.balanceOf(user2.address);
    expect(bal).to.be.gt(0);

    // Simulate exact fee calculation logic
    const feePoolWeight = await fpmm.getFeePoolWeight();
    const totalShares = await fpmm.totalSupply();
    const user1Shares = await fpmm.balanceOf(user1.address);
    const user2Shares = await fpmm.balanceOf(user2.address);

    const user1Fees = computeUserFees(feePoolWeight, user1Shares, totalShares, treasuryPercent);
    const user2Fees = computeUserFees(feePoolWeight, user2Shares, totalShares, treasuryPercent);

    const feeUser1 = await fpmm.feesWithdrawableBy(user1.address);
    const feeUser2 = await fpmm.feesWithdrawableBy(user2.address);

    const treasuryBalanceBefore = await collateralToken.balanceOf(treasury.address);
    const user1BalanceBefore = await collateralToken.balanceOf(user1.address);
    const user2BalanceBefore = await collateralToken.balanceOf(user2.address);

    if (feeUser1.gt(0)) {
      await fpmm.connect(user1).withdrawFees(user1.address);
    }
    if (feeUser2.gt(0)) {
      await fpmm.connect(user2).withdrawFees(user2.address);
    }

    const user1BalanceAfter = await collateralToken.balanceOf(user1.address);
    const user2BalanceAfter = await collateralToken.balanceOf(user2.address);
    const treasuryBalanceAfter = await collateralToken.balanceOf(treasury.address);

    expect(user1BalanceAfter.sub(user1BalanceBefore)).to.equal(user1Fees.userCut);
    expect(user2BalanceAfter.sub(user2BalanceBefore)).to.equal(user2Fees.userCut);

    const actualTreasuryFee = treasuryBalanceAfter.sub(treasuryBalanceBefore);
    const expectedTreasuryFee = user1Fees.treasuryCut.add(user2Fees.treasuryCut);

    expect(actualTreasuryFee).to.equal(expectedTreasuryFee);
  });
});

function computeUserFees(feePool, userShares, totalShares, treasuryPercent) {
    const raw = feePool.mul(userShares).div(totalShares);
    const treasuryCut = raw.mul(treasuryPercent).div(10000);
    const userCut = raw.sub(treasuryCut);
    return { raw, treasuryCut, userCut };
  }