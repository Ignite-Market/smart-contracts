const { expect } = require("chai");
const { ethers } = require("hardhat");

const { getConditionId } = require("./helpers/id-helpers.js");

// Helper big numbers
const ONE = ethers.utils.parseEther("1");
const FEE_FACTOR = ethers.utils.parseEther("0.003"); // 0.3 %

describe("FixedProductMarketMaker – full cycle value distribution", function () {
  let owner, oracle, lp, trader, treasury;
  let collateralToken, conditionalTokens, factory, fpmm;
  let conditionId, questionId;

  // Deploys a 2-outcome market
  async function deployMarket() {
    [owner, oracle, lp, trader, treasury] = await ethers.getSigners();

    // Contracts
    const Collateral = await ethers.getContractFactory("MockCoin");
    collateralToken = await Collateral.deploy();
    await collateralToken.deployed();

    const Factory = await ethers.getContractFactory("FixedProductMarketMakerFactory");
    factory = await Factory.deploy();
    await factory.deployed();

    const Conditional = await ethers.getContractFactory("ConditionalTokens");
    conditionalTokens = await Conditional.deploy(factory.address);
    await conditionalTokens.deployed();

    // Prepare condition
    questionId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    await conditionalTokens.setOracle(oracle.address, true);
    await conditionalTokens.connect(oracle).prepareCondition(oracle.address, questionId, 2);
    conditionId = getConditionId(oracle.address, questionId, 2);

    // Create market
    const fundingThreshold = 0;
    const endTime = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    const salt = ethers.utils.hexlify(ethers.utils.randomBytes(32));

    const tx = await factory.createFixedProductMarketMaker(
      conditionalTokens.address,
      collateralToken.address,
      [conditionId],
      FEE_FACTOR,
      0, // treasury percent
      treasury.address,
      fundingThreshold,
      endTime,
      salt
    );
    const receipt = await tx.wait();
    const evt = receipt.events.find(e => e.event === "FixedProductMarketMakerCreation");
    fpmm = await ethers.getContractAt("FixedProductMarketMaker", evt.args.fixedProductMarketMaker);

    await fpmm.connect(owner).finalizeSetup();
  }

  beforeEach(async function () {
    await deployMarket();
  });

  it("distributes collateral correctly through the full lifecycle", async function () {
    // Initial faucet mint
    const lpFunds = ethers.utils.parseUnits("1000", 6);
    const traderInitial = ethers.utils.parseUnits("200", 6);

    await collateralToken.faucetMint(lp.address, lpFunds);
    await collateralToken.faucetMint(trader.address, traderInitial);

    // Record initial supplies
    const totalSupplyInitial = await collateralToken.totalSupply();

    // Funding by LP
    await collateralToken.connect(lp).approve(fpmm.address, lpFunds);
    // Provide equal distribution hint for two outcomes
    await fpmm.connect(lp).addFunding(lpFunds, [1, 1]);

    // Expected liquidity after funding
    expect(await fpmm.currentLiquidity()).to.equal(lpFunds);

    // Trader buys outcome 0
    const buyAmount = ethers.utils.parseUnits("100", 6);
    const buyFee = buyAmount.mul(FEE_FACTOR).div(ONE);
    const investmentMinusFees = buyAmount.sub(buyFee);

    await collateralToken.connect(trader).approve(fpmm.address, buyAmount);
    const maxBuy = await fpmm.calcBuyAmount(buyAmount, 0);
    await fpmm.connect(trader).buy(buyAmount, 0, maxBuy);

    // Liquidity should increase by investmentMinusFees
    const liquidityAfterBuy = lpFunds.add(investmentMinusFees);
    expect(await fpmm.currentLiquidity()).to.equal(liquidityAfterBuy);

    // Amount of tokens trader received
    const outcomeTokensBought = await fpmm.calcBuyAmount(buyAmount, 0);

    // Trader sells part of tokens
    const returnAmount = ethers.utils.parseUnits("40", 6);
    const sellFee = returnAmount.mul(FEE_FACTOR).div(ONE.sub(FEE_FACTOR));

    // Need transfer approval for ERC-1155
    await conditionalTokens.connect(trader).setApprovalForAll(fpmm.address, true);
    const tokensToSell = await fpmm.calcSellAmount(returnAmount, 0);
    await fpmm.connect(trader).sell(returnAmount, 0, tokensToSell);

    // Liquidity should decrease by returnAmount (fees stay)
    const liquidityAfterSell = liquidityAfterBuy.sub(returnAmount);
    expect(await fpmm.currentLiquidity()).to.equal(liquidityAfterSell);

    // Resolve condition: outcome 0 wins
    await conditionalTokens.connect(oracle).reportPayouts(questionId, [1, 0]);

    // LP removes funding (burning all shares)
    const shares = await fpmm.balanceOf(lp.address);
    // Capture pool outcome-0 tokens before removal
    const pos0 = await fpmm.positionIds(0);
    const poolTokensOutcome0 = await conditionalTokens.balanceOf(fpmm.address, pos0);

    await fpmm.connect(lp).removeFunding(shares);

    // After burning, FPMM should hold zero collateral (fees distributed, liquidity removed)
    expect(await collateralToken.balanceOf(fpmm.address)).to.equal(ethers.constants.Zero);

    // LP redeems positions
    const lpBalBeforeRedeem = await collateralToken.balanceOf(lp.address);
    await conditionalTokens.connect(lp).redeemPositions(
      collateralToken.address,
      ethers.constants.HashZero,
      conditionId,
      [1] // indexSet for outcome 0
    );
    const lpBalAfterRedeem = await collateralToken.balanceOf(lp.address);
    const lpPayout = lpBalAfterRedeem.sub(lpBalBeforeRedeem);

    // Fees were already transferred during removeFunding burn; redeem returns only the outcome-0 tokens
    expect(lpPayout).to.be.closeTo(poolTokensOutcome0, 1000); // tolerance 1e3 units (~0.001 USDC)

    // Trader redeems remaining position
    const traderHeldTokens = await conditionalTokens.balanceOf(trader.address, pos0);

    const traderBalBefore = await collateralToken.balanceOf(trader.address);
    await conditionalTokens.connect(trader).redeemPositions(
      collateralToken.address,
      ethers.constants.HashZero,
      conditionId,
      [1]
    );
    const traderBalAfter = await collateralToken.balanceOf(trader.address);
    const traderPayout = traderBalAfter.sub(traderBalBefore);

    expect(traderPayout).to.be.closeTo(traderHeldTokens, 1000);

    // Supply invariant
    const totalSupplyFinal = await collateralToken.totalSupply();
    expect(totalSupplyFinal).to.equal(totalSupplyInitial);
  });
}); 