const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper functions
const getConditionId = (oracle, questionId, outcomeSlotCount) => 
  ethers.utils.solidityKeccak256(
    ["address", "bytes32", "uint256"],
    [oracle, questionId, outcomeSlotCount]
  );

const getCollectionId = (conditionId, indexSet) =>
  ethers.utils.solidityKeccak256(
    ["bytes32", "uint256"],
    [conditionId, indexSet]
  );

const combineCollectionIds = (collectionIds) =>
  ethers.utils.solidityKeccak256(
    ["bytes32[]"],
    [collectionIds]
  );

const getPositionId = (collateralToken, collectionId) =>
  ethers.utils.solidityKeccak256(
    ["address", "bytes32"],
    [collateralToken, collectionId]
  );

const NULL_BYTES32 = ethers.constants.HashZero;

describe("ConditionalTokens", function() {
  let ConditionalTokens, ERC20Mintable, Forwarder, DefaultCallbackHandler, GnosisSafe;
  let conditionalTokens, collateralToken;
  let minter, oracle, notOracle, eoaTrader, fwdExecutor, safeExecutor, counterparty;

  beforeEach(async function() {
    [minter, oracle, notOracle, eoaTrader, fwdExecutor, safeExecutor, counterparty] = await ethers.getSigners();
    
    ConditionalTokens = await ethers.getContractFactory("contracts/ConditionalTokens/ConditionalTokens.sol:ConditionalTokens");
    conditionalTokens = await ConditionalTokens.deploy();
    await conditionalTokens.deployed();
  });

  describe("prepareCondition", function() {
    it("should not be able to prepare a condition with no outcome slots", async function() {
      const questionId = ethers.utils.randomBytes(32);
      const outcomeSlotCount = 0;

      await expect(
        conditionalTokens.prepareCondition(
          oracle.address,
          questionId,
          outcomeSlotCount
        )
      ).to.be.revertedWith("there should be more than one outcome slot");
    });

    it("should not be able to prepare a condition with just one outcome slot", async function() {
      const questionId = ethers.utils.randomBytes(32);
      const outcomeSlotCount = 1;

      await expect(
        conditionalTokens.prepareCondition(
          oracle.address,
          questionId,
          outcomeSlotCount
        )
      ).to.be.revertedWith("there should be more than one outcome slot");
    });

    context("with valid parameters", function() {
      let questionId, outcomeSlotCount, conditionId;

      beforeEach(async function() {
        questionId = ethers.utils.randomBytes(32);
        outcomeSlotCount = 256;
        conditionId = getConditionId(oracle.address, questionId, outcomeSlotCount);
      });

      it("should emit a ConditionPreparation event", async function() {
        await expect(
          conditionalTokens.prepareCondition(
            oracle.address,
            questionId,
            outcomeSlotCount
          )
        )
          .to.emit(conditionalTokens, "ConditionPreparation")
          .withArgs(conditionId, oracle.address, questionId, outcomeSlotCount);
      });

      it("should make outcome slot count available via getOutcomeSlotCount", async function() {
        await conditionalTokens.prepareCondition(
          oracle.address,
          questionId,
          outcomeSlotCount
        );

        const count = await conditionalTokens.getOutcomeSlotCount(conditionId);
        expect(count).to.equal(outcomeSlotCount);
      });

      it("should leave payout denominator unset", async function() {
        await conditionalTokens.prepareCondition(
          oracle.address,
          questionId,
          outcomeSlotCount
        );

        const denominator = await conditionalTokens.payoutDenominator(conditionId);
        expect(denominator).to.equal(0);
      });

      it("should not be able to prepare the same condition more than once", async function() {
        await conditionalTokens.prepareCondition(
          oracle.address,
          questionId,
          outcomeSlotCount
        );

        await expect(
          conditionalTokens.prepareCondition(
            oracle.address,
            questionId,
            outcomeSlotCount
          )
        ).to.be.revertedWith("condition already prepared");
      });
    });
  });

  describe("reportPayouts", function() {
    let questionId, outcomeSlotCount, conditionId;

    beforeEach(async function() {
      questionId = ethers.utils.randomBytes(32);
      outcomeSlotCount = 3;
      conditionId = getConditionId(oracle.address, questionId, outcomeSlotCount);
      await conditionalTokens.prepareCondition(oracle.address, questionId, outcomeSlotCount);
    });

    it("should not work for conditions that are not prepared", async function() {
      const unknownQuestionId = ethers.utils.randomBytes(32);
      const unknownConditionId = getConditionId(oracle.address, unknownQuestionId, outcomeSlotCount);
      
      await expect(
        conditionalTokens.reportPayouts(unknownQuestionId, [1, 0, 0])
      ).to.be.revertedWith("condition not prepared");
    });

    it("should not work for conditions that have already been resolved", async function() {
      await conditionalTokens.connect(oracle).reportPayouts(questionId, [1, 0, 0]);
      
      await expect(
        conditionalTokens.connect(oracle).reportPayouts(questionId, [0, 1, 0])
      ).to.be.revertedWith("payout denominator already set");
    });

    it("should not work with an invalid number of payouts", async function() {
      await expect(
        conditionalTokens.connect(oracle).reportPayouts(questionId, [])
      ).to.be.revertedWith("wrong number of payouts");

      await expect(
        conditionalTokens.connect(oracle).reportPayouts(questionId, [0, 0])
      ).to.be.revertedWith("wrong number of payouts");

      await expect(
        conditionalTokens.connect(oracle).reportPayouts(questionId, [0, 0, 0, 0])
      ).to.be.revertedWith("wrong number of payouts");
    });

    it("should not work if sender is not oracle", async function() {
      await expect(
        conditionalTokens.connect(notOracle).reportPayouts(questionId, [1, 0, 0])
      ).to.be.revertedWith("condition not prepared or reporter is not oracle");
    });

    it("should not work if payouts sum to zero", async function() {
      await expect(
        conditionalTokens.connect(oracle).reportPayouts(questionId, [0, 0, 0])
      ).to.be.revertedWith("payout denominator is zero");
    });

    context("with valid payouts", function() {
      let payouts;
      
      beforeEach(async function() {
        payouts = [3, 2, 5];
      });

      it("should emit ConditionResolution event", async function() {
        await expect(
          conditionalTokens.connect(oracle).reportPayouts(questionId, payouts)
        )
          .to.emit(conditionalTokens, "ConditionResolution")
          .withArgs(conditionId, oracle.address, questionId, outcomeSlotCount, payouts);
      });

      it("should set the payout denominator", async function() {
        await conditionalTokens.connect(oracle).reportPayouts(questionId, payouts);
        
        const payoutDenominator = await conditionalTokens.payoutDenominator(conditionId);
        const payoutSum = payouts.reduce((a, b) => a + b, 0);
        expect(payoutDenominator).to.equal(payoutSum);
      });

      it("should set the payouts", async function() {
        await conditionalTokens.connect(oracle).reportPayouts(questionId, payouts);
        
        for(let i = 0; i < payouts.length; i++) {
          const payout = await conditionalTokens.payoutNumerators(conditionId, i);
          expect(payout).to.equal(payouts[i]);
        }
      });
    });
  });

  describe("splitPosition", function() {
    let collateralToken, questionId, outcomeSlotCount, conditionId;
    const amount = ethers.utils.parseEther("1");

    beforeEach(async function() {
      // Deploy mock ERC20 for collateral
      const ERC20Mock = await ethers.getContractFactory("MockCoin");
      collateralToken = await ERC20Mock.deploy();
      await collateralToken.deployed();
      await collateralToken.mint(minter.address, ethers.utils.parseEther("1000"));
      await collateralToken.mint(eoaTrader.address, ethers.utils.parseEther("1000"));

      questionId = ethers.utils.randomBytes(32);
      outcomeSlotCount = 3;
      conditionId = getConditionId(oracle.address, questionId, outcomeSlotCount);
      
      await conditionalTokens.prepareCondition(oracle.address, questionId, outcomeSlotCount);
      
      // Mint tokens to trader
      await collateralToken.connect(minter).transfer(eoaTrader.address, amount);
      await collateralToken.connect(eoaTrader).approve(conditionalTokens.address, amount);
    });

    it("should not split position on uninitialized condition", async function() {
      const unknownQuestionId = ethers.utils.randomBytes(32);
      const unknownConditionId = getConditionId(oracle.address, unknownQuestionId, outcomeSlotCount);
      const partition = [1, 2, 4];

      await expect(
        conditionalTokens.connect(eoaTrader).splitPosition(
          collateralToken.address,
          NULL_BYTES32,
          unknownConditionId,
          partition,
          amount
        )
      ).to.be.revertedWith("condition not prepared");
    });

    it("should not split position with invalid partition", async function() {
      // Empty partition
      await expect(
        conditionalTokens.connect(eoaTrader).splitPosition(
          collateralToken.address,
          NULL_BYTES32,
          conditionId,
          [],
          amount
        )
      ).to.be.revertedWith("got empty or singleton partition");

      // Partition with 0
      await expect(
        conditionalTokens.connect(eoaTrader).splitPosition(
          collateralToken.address,
          NULL_BYTES32,
          conditionId,
          [0],
          amount
        )
      ).to.be.revertedWith("got empty or singleton partition");

      // invalid partition sum
      await expect(
        conditionalTokens.connect(eoaTrader).splitPosition(
          collateralToken.address,
          NULL_BYTES32,
          conditionId,
          [1, 4],
          amount
        )
      ).to.be.revertedWith("partition must be valid");
    });

    it("should not split position with zero amount", async function() {
      const partition = [1, 2, 4];
      await expect(
        conditionalTokens.connect(eoaTrader).splitPosition(
          collateralToken.address,
          NULL_BYTES32,
          conditionId,
          partition,
          0
        )
      ).to.be.revertedWith("amount must be positive");
    });

    context("with valid parameters", function() {
      const partition = [1, 2, 4];
      let parentCollectionId, conditionId;

      beforeEach(async function() {
        parentCollectionId = NULL_BYTES32;
        conditionId = getConditionId(oracle.address, questionId, outcomeSlotCount);
      });

      it("should transfer collateral tokens from sender", async function() {
        const balanceBefore = await collateralToken.balanceOf(eoaTrader.address);
        
        await conditionalTokens.connect(eoaTrader).splitPosition(
          collateralToken.address,
          parentCollectionId,
          conditionId,
          partition,
          amount
        );

        const balanceAfter = await collateralToken.balanceOf(eoaTrader.address);
        expect(balanceAfter).to.equal(balanceBefore.sub(amount));
      });

      it("should mint correct amount of conditional tokens", async function() {
        await conditionalTokens.connect(eoaTrader).splitPosition(
          collateralToken.address,
          parentCollectionId,
          conditionId,
          partition,
          amount
        );

        for (let i = 0; i < partition.length; i++) {
          const indexSet = partition[i];
          const collectionId = getCollectionId(conditionId, indexSet);
          const positionId = getPositionId(collateralToken.address, collectionId);
          
          const balance = await conditionalTokens.balanceOf(eoaTrader.address, positionId);
          expect(balance).to.equal(amount);
        }
      });

      it("should emit appropriate PositionSplit events", async function() {
        await expect(
          conditionalTokens.connect(eoaTrader).splitPosition(
            collateralToken.address,
            parentCollectionId,
            conditionId,
            partition,
            amount
          )
        )
          .to.emit(conditionalTokens, "PositionSplit")
          .withArgs(
            eoaTrader.address,
            collateralToken.address,
            parentCollectionId,
            conditionId,
            partition,
            amount
          );
      });
    });

    context("when splitting already split position", function() {
      const firstPartition = [1, 2];
      const secondPartition = [1];
      let firstCollectionId;

      beforeEach(async function() {
        // First split
        await conditionalTokens.connect(eoaTrader).splitPosition(
          collateralToken.address,
          NULL_BYTES32,
          conditionId,
          firstPartition,
          amount
        );

        firstCollectionId = getCollectionId(conditionId, firstPartition[0]);
      });

      it("should allow splitting previously split positions", async function() {
        const positionId = getPositionId(collateralToken.address, firstCollectionId);
        
        await conditionalTokens.connect(eoaTrader).splitPosition(
          collateralToken.address,
          firstCollectionId,
          conditionId,
          secondPartition,
          amount
        );

        const balance = await conditionalTokens.balanceOf(eoaTrader.address, positionId);
        expect(balance).to.equal(0);
      });
    });
  });

  describe("mergePositions", function() {
    let collateralToken, questionId, outcomeSlotCount, conditionId;
    const amount = ethers.utils.parseEther("1");

    beforeEach(async function() {
      // Deploy mock ERC20 for collateral
      const ERC20Mock = await ethers.getContractFactory("MockCoin");
      collateralToken = await ERC20Mock.deploy();
      await collateralToken.deployed();
      await collateralToken.mint(minter.address, ethers.utils.parseEther("1000"));
      await collateralToken.mint(eoaTrader.address, ethers.utils.parseEther("1000"));

      questionId = ethers.utils.randomBytes(32);
      outcomeSlotCount = 3;
      conditionId = getConditionId(oracle.address, questionId, outcomeSlotCount);
      
      await conditionalTokens.prepareCondition(oracle.address, questionId, outcomeSlotCount);
      
      // Mint tokens to trader
      await collateralToken.connect(minter).transfer(eoaTrader.address, amount);
      await collateralToken.connect(eoaTrader).approve(conditionalTokens.address, amount);
    });

    it("should not merge positions on uninitialized condition", async function() {
      const unknownQuestionId = ethers.utils.randomBytes(32);
      const unknownConditionId = getConditionId(oracle.address, unknownQuestionId, outcomeSlotCount);
      const partition = [1, 2, 4];

      await expect(
        conditionalTokens.connect(eoaTrader).mergePositions(
          collateralToken.address,
          NULL_BYTES32,
          unknownConditionId,
          partition,
          amount
        )
      ).to.be.revertedWith("condition not prepared");
    });

    it("should not merge positions with invalid partition", async function() {
      const partition = [1, 2];
      await expect(
        conditionalTokens.connect(eoaTrader).mergePositions(
          collateralToken.address,
          NULL_BYTES32,
          conditionId,
          partition,
          amount
        )
      ).to.be.revertedWith("partition must be valid");
    });

    context("with valid split positions", function() {
      const partition = [1, 2, 4];
      let parentCollectionId;

      beforeEach(async function() {
        parentCollectionId = NULL_BYTES32;
        
        // First split the positions
        await conditionalTokens.connect(eoaTrader).splitPosition(
          collateralToken.address,
          parentCollectionId,
          conditionId,
          partition,
          amount
        );
      });

      it("should burn conditional tokens and return collateral", async function() {
        const collateralBefore = await collateralToken.balanceOf(eoaTrader.address);
        
        await conditionalTokens.connect(eoaTrader).mergePositions(
          collateralToken.address,
          parentCollectionId,
          conditionId,
          partition,
          amount
        );

        // Check collateral returned
        const collateralAfter = await collateralToken.balanceOf(eoaTrader.address);
        expect(collateralAfter).to.equal(collateralBefore.add(amount));

        // Check conditional tokens burned
        for (let i = 0; i < partition.length; i++) {
          const indexSet = partition[i];
          const collectionId = getCollectionId(conditionId, indexSet);
          const positionId = getPositionId(collateralToken.address, collectionId);
          
          const balance = await conditionalTokens.balanceOf(eoaTrader.address, positionId);
          expect(balance).to.equal(0);
        }
      });

      it("should emit PositionsMerge event", async function() {
        await expect(
          conditionalTokens.connect(eoaTrader).mergePositions(
            collateralToken.address,
            parentCollectionId,
            conditionId,
            partition,
            amount
          )
        )
          .to.emit(conditionalTokens, "PositionsMerge")
          .withArgs(
            eoaTrader.address,
            collateralToken.address,
            parentCollectionId,
            conditionId,
            partition,
            amount
          );
      });
    });
  });

  describe("redeemPositions", function() {
    let collateralToken, questionId, outcomeSlotCount, conditionId;
    const amount = ethers.utils.parseEther("1");
    const partition = [1, 2, 4];

    beforeEach(async function() {
      // Deploy mock ERC20 for collateral
      const ERC20Mock = await ethers.getContractFactory("MockCoin");
      collateralToken = await ERC20Mock.deploy();
      await collateralToken.deployed();
      await collateralToken.mint(minter.address, ethers.utils.parseEther("1000"));
      await collateralToken.mint(eoaTrader.address, ethers.utils.parseEther("1000"));

      questionId = ethers.utils.randomBytes(32);
      outcomeSlotCount = 3;
      conditionId = getConditionId(oracle.address, questionId, outcomeSlotCount);
      
      await conditionalTokens.prepareCondition(oracle.address, questionId, outcomeSlotCount);
      
      // Mint tokens to trader
      await collateralToken.connect(minter).transfer(eoaTrader.address, amount);
      await collateralToken.connect(eoaTrader).approve(conditionalTokens.address, amount);

      // Split positions
      await conditionalTokens.connect(eoaTrader).splitPosition(
        collateralToken.address,
        NULL_BYTES32,
        conditionId,
        partition,
        amount
      );
    });

    it("should not redeem positions for unresolved condition", async function() {
      await expect(
        conditionalTokens.connect(eoaTrader).redeemPositions(
          collateralToken.address,
          NULL_BYTES32,
          conditionId,
          partition
        )
      ).to.be.revertedWith("condition not resolved");
    });

    context("with resolved condition", function() {
      beforeEach(async function() {
        // Report payouts
        await conditionalTokens.connect(oracle).reportPayouts(questionId, [1, 0, 1]);
      });

      it("should redeem positions and return collateral proportionally", async function() {
        const collateralBefore = await collateralToken.balanceOf(eoaTrader.address);
        
        await conditionalTokens.connect(eoaTrader).redeemPositions(
          collateralToken.address,
          NULL_BYTES32,
          conditionId,
          partition
        );

        const collateralAfter = await collateralToken.balanceOf(eoaTrader.address);
        // Expect 2/3 of amount back based on payouts [1, 0, 1]
        expect(collateralAfter).to.equal(collateralBefore.add(amount.mul(2).div(3)));
      });

      it("should emit PayoutRedemption event", async function() {
        await expect(
          conditionalTokens.connect(eoaTrader).redeemPositions(
            collateralToken.address,
            NULL_BYTES32,
            conditionId,
            partition
          )
        )
          .to.emit(conditionalTokens, "PayoutRedemption")
          .withArgs(
            eoaTrader.address,
            collateralToken.address,
            NULL_BYTES32,
            conditionId,
            partition
          );
      });
    });
  });
});