const { expect } = require("chai");
const { ethers } = require("hardhat");

const { getConditionId } = require("./helpers/id-helpers.js");

describe("FixedProductMarketMaker - position ordering", function () {
  let owner, oracle, lp, trader, treasury;
  let collateralToken, conditionalTokens, factory, fpmm;
  let conditionId;
  let questionId;

  // Helper to deploy and setup a 2-outcome market
  async function deployMarket(outcomeSlotCount = 2) {
    [owner, oracle, lp, trader, treasury] = await ethers.getSigners();

    // Deploy contracts
    const Collateral = await ethers.getContractFactory("MockCoin");
    const Conditional = await ethers.getContractFactory("ConditionalTokens");
    const Factory = await ethers.getContractFactory("FixedProductMarketMakerFactory");

    collateralToken = await Collateral.deploy();
    await collateralToken.deployed();

    factory = await Factory.deploy();
    await factory.deployed();

    conditionalTokens = await Conditional.deploy(factory.address);
    await conditionalTokens.deployed();

    // Give oracle its role and prepare condition
    questionId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    await conditionalTokens.setOracle(oracle.address, true);
    await conditionalTokens.connect(oracle).prepareCondition(
      oracle.address,
      questionId,
      outcomeSlotCount
    );

    conditionId = getConditionId(oracle.address, questionId, outcomeSlotCount);

    const feeFactor = ethers.utils.parseUnits("0.003", 18); // 0.3 %
    const treasuryPercent = 0; // simplify – no treasury cut
    const fundingThreshold = 0; // irrelevant for tests
    const endTime = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
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
      10, // buySellCapPercent (10%)
      salt
    );
    const receipt = await tx.wait();
    const creationEvt = receipt.events.find(e => e.event === "FixedProductMarketMakerCreation");
    fpmm = await ethers.getContractAt("FixedProductMarketMaker", creationEvt.args.fixedProductMarketMaker);

    await fpmm.connect(owner).finalizeSetup();
  }

  beforeEach(async function () {
    await deployMarket();
  });

  it("stores positionIds in ascending outcome order", async function () {
    for (let outcome = 0; outcome < 2; outcome++) {
      const indexSet = 1 << outcome;
      const expectedCollectionId = await conditionalTokens.getCollectionId(
        ethers.constants.HashZero,
        conditionId,
        indexSet
      );
      const expectedPositionId = await conditionalTokens.getPositionId(
        collateralToken.address,
        expectedCollectionId
      );

      const onChainPositionId = await fpmm.positionIds(outcome);
      expect(onChainPositionId).to.equal(expectedPositionId);
    }
  });

  it("gives trader the correct ERC-1155 token when buying outcome 0 and allows redeeming it", async function () {
    // Mint tokens to LP and trader
    const lpFunds = ethers.utils.parseUnits("200", 6);
    const traderFunds = ethers.utils.parseUnits("50", 6);

    await collateralToken.faucetMint(lp.address, lpFunds);
    await collateralToken.faucetMint(trader.address, traderFunds);

    // LP adds funding (initial)
    await collateralToken.connect(lp).approve(fpmm.address, lpFunds);
    await fpmm.connect(lp).addFunding(lpFunds, [1, 1]);

    // Trader buys outcome 0 (must respect 10% liquidity rule)
    const buyAmount = ethers.utils.parseUnits("10", 6);
    await collateralToken.connect(trader).approve(fpmm.address, buyAmount);
    const maxBuy = await fpmm.calcBuyAmount(buyAmount, 0);
    await fpmm.connect(trader).buy(buyAmount, 0, maxBuy);

    const posId0 = await fpmm.positionIds(0);
    const posId1 = await fpmm.positionIds(1);

    const balance0 = await conditionalTokens.balanceOf(trader.address, posId0);
    const balance1 = await conditionalTokens.balanceOf(trader.address, posId1);

    expect(balance0).to.be.gt(ethers.constants.Zero);
    expect(balance1).to.equal(ethers.constants.Zero);

    // Resolve – outcome 0 wins
    await conditionalTokens.connect(oracle).reportPayouts(questionId, [1, 0]);

    // Trader redeems – should receive some collateral
    const before = await collateralToken.balanceOf(trader.address);
    const indexSet = 1 << 0;
    await conditionalTokens.connect(trader).redeemPositions(
      collateralToken.address,
      ethers.constants.HashZero,
      conditionId,
      [indexSet]
    );
    const after = await collateralToken.balanceOf(trader.address);

    expect(after).to.be.gt(before);
  });
}); 