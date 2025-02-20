const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  getConditionId,
  getPositionId,
  getCollectionId,
  combineCollectionIds,
} = require('./helpers/id-helpers.js');
const { randomHex } = require('./helpers/utils.js');

const NULL_BYTES32 = ethers.constants.HashZero;

const Scenarios = Object.freeze({
  EOA: Symbol("EOA"),
  FORWARDER: Symbol("FORWARDER"),
});

describe("ConditionalTokens", function() {
  let ConditionalTokens, ERC20Mintable, Forwarder;
  let conditionalTokens, collateralToken, forwarder;
  let minter, oracle, notOracle, eoaTrader, fwdExecutor, counterparty;

  before(async () => {
    await hre.network.provider.send("hardhat_reset");
  });

  beforeEach(async function() {
    [minter, oracle, notOracle, eoaTrader, fwdExecutor, counterparty] = await ethers.getSigners();

    // ConditionalTokens = await ethers.getContractFactory("contracts/ConditionalTokens/ConditionalTokens.sol:ConditionalTokens");
    ConditionalTokens = await ethers.getContractFactory("ConditionalTokens");
    conditionalTokens = await ConditionalTokens.deploy();
    await conditionalTokens.deployed();

    ERC20Mintable = await ethers.getContractFactory("contracts/Test/MockCoin.sol:MockCoin");
    collateralToken = await ERC20Mintable.deploy();
    await collateralToken.deployed();

    Forwarder = await ethers.getContractFactory("contracts/Test/Forwarder.sol:Forwarder");
    forwarder = await Forwarder.deploy();
    await forwarder.deployed();
  });

  describe("DUMMY-TESTING", function() {
    it("some random test", async function() {
      const questionId = ethers.utils.randomBytes(32);
      const outcomeSlotCount = 2;

      await conditionalTokens.prepareCondition(
        oracle.address,
        questionId,
        outcomeSlotCount
      )
    });
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
        questionId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
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
          .withArgs(conditionId, oracle.address, questionId, ethers.BigNumber.from(outcomeSlotCount));
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

  function createTraderWrapper(trader, scenario) {
    return {
      address: trader.address,
      async splitPosition(...args) {
        if (scenario === Scenarios.EOA) {
          return conditionalTokens.connect(trader).splitPosition(...args);
        } else {
          return trader.execCall(conditionalTokens, "splitPosition", ...args);
        }
      },
      async mergePositions(...args) {
        if (scenario === Scenarios.EOA) {
          return conditionalTokens.connect(trader).mergePositions(...args);
        } else {
          return trader.execCall(conditionalTokens, "mergePositions", ...args);
        }
      },
      async safeTransferFrom(...args) {
        if (scenario === Scenarios.EOA) {
          return conditionalTokens.connect(trader).safeTransferFrom(...args);
        } else {
          return trader.execCall(conditionalTokens, "safeTransferFrom", ...args);
        }
      },
      async redeemPositions(...args) {
        if (scenario === Scenarios.EOA) {
          return conditionalTokens.connect(trader).redeemPositions(...args);
        } else {
          return trader.execCall(conditionalTokens, "redeemPositions", ...args);
        }
      },
      async approve(token, spender, amount) {
        if (scenario === Scenarios.EOA) {
          return token.connect(trader).approve(spender, amount);
        } else {
          return trader.execCall(token, "approve", spender, amount);
        }
      }
    };
  }

  describe("splitting and merging", function() {
    const collateralTokenCount = ethers.utils.parseEther("10"); // 1e19
    const splitAmount = ethers.utils.parseEther("4");  // 4e18
    const mergeAmount = ethers.utils.parseEther("3");  // 3e18

    const scenarios = [
      {
        name: Scenarios.EOA,
        context: "with EOA trader (Externally Owned Account)",
        setupTrader: async () => createTraderWrapper(eoaTrader, Scenarios.EOA)
      },
      // {
      //   name: Scenarios.FORWARDER,
      //   context: "with a Forwarder",
      //   setupTrader: async function() {
      //     const forwarderTrader = {
      //       address: forwarder.address,
      //       async execCall(contract, method, ...args) {
      //         const data = contract.interface.encodeFunctionData(method, args);
      //         return await forwarder.connect(fwdExecutor).call(
      //           contract.address,
      //           data
      //         );
      //       }
      //     };
      //     return createTraderWrapper(forwarderTrader, Scenarios.FORWARDER);
      //   }
      // }
    ];

    for (const scenario of scenarios) {
      describe(scenario.context, function() {
        let questionId, conditionId;
        const outcomeSlotCount = 2;
        let trader = null;

        beforeEach(async function() {
          trader = await scenario.setupTrader();

          // Setup collateral token
          await collateralToken.mint(trader.address, collateralTokenCount);
          await trader.approve(collateralToken, conditionalTokens.address, collateralTokenCount);

          // Prepare condition
          questionId = randomHex(32);
          conditionId = getConditionId(oracle.address, questionId, outcomeSlotCount);
        });

        it("should not split on unprepared conditions", async function() {
          await expect(
            trader.splitPosition(
              collateralToken.address,
              NULL_BYTES32,
              conditionId,
              [1, 2],
              splitAmount
            )
          ).to.be.reverted;
        });

        context("with a condition prepared", function() {
          beforeEach(async function() {
            await conditionalTokens.prepareCondition(oracle.address, questionId, outcomeSlotCount);
          });

          it("should not split if partitions aren't disjoint", async function() {
            await expect(
              trader.splitPosition(
                collateralToken.address,
                NULL_BYTES32,
                conditionId,
                [0b11, 0b10],
                splitAmount
              )
            ).to.be.reverted;
          });

          it("should not split if partitioning more than condition's outcome slots", async function() {
            await expect(
              trader.splitPosition(
                collateralToken.address,
                NULL_BYTES32,
                conditionId,
                [0b001, 0b010, 0b100],
                splitAmount
              )
            ).to.be.reverted;
          });

          it("should not split if given a singleton partition", async function() {
            await expect(
              trader.splitPosition(
                collateralToken.address,
                NULL_BYTES32,
                conditionId,
                [0b11],
                splitAmount
              )
            ).to.be.reverted;
          });

          context("with valid split", function() {
            const partition = [0b01, 0b10];

            beforeEach(async function() {
              this.splitTx = await trader.splitPosition(
                collateralToken.address,
                NULL_BYTES32,
                conditionId,
                partition,
                splitAmount
              );
            });

            it("should emit PositionSplit event", async function() {
              await expect(this.splitTx)
                .to.emit(conditionalTokens, "PositionSplit")
                .withArgs(
                  trader.address,
                  collateralToken.address,
                  NULL_BYTES32,
                  conditionId,
                  partition,
                  splitAmount
                );
            });

            it("should transfer split collateral from trader", async function() {
              expect(await collateralToken.balanceOf(trader.address)).to.equal(collateralTokenCount.sub(splitAmount));
              expect(await collateralToken.balanceOf(conditionalTokens.address)).to.equal(splitAmount);
            });

            it("should mint amounts in positions associated with partition", async function() {
              for (const indexSet of partition) {
                const collectionId = getCollectionId(conditionId, indexSet)
                const positionId = getPositionId(collateralToken.address, collectionId);
            
                expect(await conditionalTokens.balanceOf(trader.address, positionId)).to.equal(splitAmount);
              }
            });

            it("should not merge if amount exceeds balances in to-be-merged positions", async function() {
              await expect(
                trader.mergePositions(
                  collateralToken.address,
                  NULL_BYTES32,
                  conditionId,
                  partition,
                  splitAmount.add(1)
                )
              ).to.be.reverted;
            });

            context("with valid merge", function() {
              beforeEach(async function() {
                this.mergeTx = await trader.mergePositions(
                  collateralToken.address,
                  NULL_BYTES32,
                  conditionId,
                  partition,
                  mergeAmount
                );
              });

              it("should emit PositionsMerge event", async function() {
                await expect(this.mergeTx)
                  .to.emit(conditionalTokens, "PositionsMerge")
                  .withArgs(
                    trader.address,
                    collateralToken.address,
                    NULL_BYTES32,
                    conditionId,
                    partition,
                    mergeAmount
                  );
              });

              it("should transfer split collateral back to trader", async function() {
                expect(await collateralToken.balanceOf(trader.address)).to.equal(collateralTokenCount.sub(splitAmount).add(mergeAmount));
                expect(await collateralToken.balanceOf(conditionalTokens.address)).to.equal(splitAmount.sub(mergeAmount));
              });

              it("should burn amounts in positions associated with partition", async function() {
                for (const indexSet of partition) {
                  const collectionId = getCollectionId(conditionId, indexSet)
                  const positionId = getPositionId(collateralToken.address, collectionId);
            
                  expect(await conditionalTokens.balanceOf(trader.address, positionId)).to.equal(splitAmount.sub(mergeAmount));
                }
              });
            });

            describe("transferring, reporting, and redeeming", function() {
              const transferAmount = ethers.utils.parseEther("1");
              const payoutNumerators = [ethers.BigNumber.from(3), ethers.BigNumber.from(7)];

              it("should not allow transferring more than split balance", async function() {
                const collectionId = getCollectionId(conditionId, partition[0]);
                const positionId = getPositionId(collateralToken.address, collectionId);

                await expect(
                  trader.safeTransferFrom(
                    trader.address,
                    counterparty.address,
                    positionId,
                    splitAmount.add(1),
                    "0x"
                  )
                ).to.be.reverted;
              });

              it("should not allow reporting by incorrect oracle", async function() {
                await expect(
                  conditionalTokens.connect(notOracle).reportPayouts(
                    questionId,
                    payoutNumerators
                  )
                ).to.be.revertedWith("condition not prepared or found");
              });

              it("should not allow report with wrong questionId", async function() {
                const wrongQuestionId = randomHex(32);
                await expect(
                  conditionalTokens.connect(oracle).reportPayouts(
                    wrongQuestionId,
                    payoutNumerators
                  )
                ).to.be.revertedWith("condition not prepared or found");
              });

              it("should not allow report with no slots", async function() {
                await expect(
                  conditionalTokens.connect(oracle).reportPayouts(
                    questionId,
                    []
                  )
                ).to.be.revertedWith("there should be more than one outcome slot");
              });

              it("should not allow report with wrong number of slots", async function() {
                await expect(
                  conditionalTokens.connect(oracle).reportPayouts(
                    questionId,
                    [2, 3, 5]
                  )
                ).to.be.revertedWith("condition not prepared or found");
              });

              it("should not allow report with zero payouts in all slots", async function() {
                await expect(
                  conditionalTokens.connect(oracle).reportPayouts(
                    questionId,
                    [0, 0]
                  )
                ).to.be.revertedWith("payout is all zeroes");
              });

              context("with valid transfer and oracle report", function() {
                beforeEach(async function() {
                  const collectionId = getCollectionId(conditionId, partition[0]);
                  const positionId = getPositionId(collateralToken.address, collectionId);

                  this.transferTx = await trader.safeTransferFrom(
                    trader.address,
                    counterparty.address,
                    positionId,
                    transferAmount,
                    "0x"
                  );

                  this.reportTx = await conditionalTokens.connect(oracle).reportPayouts(
                    questionId,
                    payoutNumerators
                  );
                });

                it("should not merge if any amount is short", async function() {
                  await expect(
                    trader.mergePositions(
                      collateralToken.address,
                      NULL_BYTES32,
                      conditionId,
                      partition,
                      splitAmount
                    )
                  ).to.be.reverted;
                });

                it("should emit ConditionResolution event", async function() {
                  await expect(this.reportTx)
                    .to.emit(conditionalTokens, "ConditionResolution")
                    .withArgs(conditionId, oracle.address, questionId, 2, payoutNumerators);
                });

                it("should make reported payout numerators available", async function() {
                  for (let i = 0; i < payoutNumerators.length; i++) {
                    expect(await conditionalTokens.payoutNumerators(conditionId, i)).to.equal(payoutNumerators[i]);
                  }
                });

                context("with redemption", function() {
                  beforeEach(async function() {
                    this.redeemTx = await trader.redeemPositions(
                      collateralToken.address,
                      NULL_BYTES32,
                      conditionId,
                      partition
                    );
                  });

                  it("should emit PayoutRedemption event", async function() {
                    const payoutDenominator = payoutNumerators.reduce((a, b) => a.add(b));
                    const payout = splitAmount.sub(transferAmount)
                      .mul(payoutNumerators[0])
                      .div(payoutDenominator)
                      .add(
                        splitAmount
                          .mul(payoutNumerators[1])
                          .div(payoutDenominator)
                      );

                    await expect(this.redeemTx)
                      .to.emit(conditionalTokens, "PayoutRedemption")
                      .withArgs(
                        trader.address,
                        collateralToken.address,
                        NULL_BYTES32,
                        conditionId,
                        partition,
                        payout
                      );
                  });

                  it("should zero out redeemed positions", async function() {
                    for (const indexSet of partition) {
                      const collectionId = getCollectionId(conditionId, indexSet);
                      const positionId = getPositionId(collateralToken.address, collectionId);
                      
                      expect(await conditionalTokens.balanceOf(trader.address, positionId)).to.equal(0);
                    }
                  });

                  it("should not affect other's positions", async function() {
                    const collectionId = getCollectionId(conditionId, partition[0]);
                    const positionId = getPositionId(collateralToken.address, collectionId);

                    expect(await conditionalTokens.balanceOf(counterparty.address, positionId)).to.equal(transferAmount);
                  });

                  it("should credit payout as collateral", async function() {
                    const payoutDenominator = payoutNumerators.reduce((a, b) => a.add(b));
                    const payout = splitAmount.sub(transferAmount)
                      .mul(payoutNumerators[0])
                      .div(payoutDenominator)
                      .add(
                        splitAmount
                          .mul(payoutNumerators[1])
                          .div(payoutDenominator)
                      );

                    expect(await collateralToken.balanceOf(trader.address)).to.equal(collateralTokenCount.sub(splitAmount).add(payout));
                  });
                });
              });
            });
          });
        });

        context("with many conditions prepared", function() {
          let conditions = [];
    
          beforeEach(async function() {
            conditions = Array.from({ length: 3 }, () => ({
              id: null,
              oracle: oracle.address,
              questionId: randomHex(32),
              outcomeSlotCount: ethers.BigNumber.from(4)
            }));

            conditions.forEach(condition => {
              condition.id = getConditionId(
                condition.oracle,
                condition.questionId,
                condition.outcomeSlotCount
              );
            });

            for (const { oracle, questionId, outcomeSlotCount } of conditions) {
              await conditionalTokens.prepareCondition(oracle, questionId, outcomeSlotCount);
            }
          });
    
          context("when trader has collateralized a condition", function() {
            let condition = null;

            const finalReport = [0, 33, 289, 678].map(n => ethers.BigNumber.from(n));
            const payoutDenominator = finalReport.reduce((a, b) => a.add(b));
            const partition = [0b0111, 0b1000];
            const positionIndexSet = partition[0];
    
            beforeEach(async function() {
              condition = conditions[0];

              await trader.splitPosition(
                collateralToken.address,
                NULL_BYTES32,
                condition.id,
                partition,
                collateralTokenCount
              );
    
              const collectionId = getCollectionId(condition.id, partition[1]);
              const positionId = getPositionId(collateralToken.address, collectionId);

              await trader.safeTransferFrom(
                trader.address,
                counterparty.address,
                positionId,
                collateralTokenCount,
                "0x"
              );
            });
    
            context("when trader splits to a deeper position with another condition", function() {
              let conditionId2 =  null;
              let parentCollectionId = null;

              const partition2 = [0b0001, 0b0010, 0b1100];
              const deepSplitAmount = ethers.utils.parseEther("4");
              
    
              beforeEach(async function() {
                conditionId2 = conditions[1].id;
                parentCollectionId = getCollectionId(condition.id, positionIndexSet);

                this.deepSplitTx = await trader.splitPosition(
                  collateralToken.address,
                  parentCollectionId,
                  conditionId2,
                  partition2,
                  deepSplitAmount
                );
              });
    
              it("combines collection IDs", async function() {
                for (const indexSet of partition2) {
                  const expectedCollectionId = combineCollectionIds([
                    parentCollectionId,
                    getCollectionId(conditionId2, indexSet)
                  ]);
    
                  expect(
                    await conditionalTokens.getCollectionId(
                      parentCollectionId,
                      conditionId2,
                      indexSet
                    )
                  ).to.equal(expectedCollectionId);
                }
              });
    
              it("emits PositionSplit event for deeper split", async function() {
                await expect(this.deepSplitTx)
                  .to.emit(conditionalTokens, "PositionSplit")
                  .withArgs(
                    trader.address,
                    collateralToken.address,
                    parentCollectionId,
                    conditionId2,
                    partition2,
                    deepSplitAmount
                  );
              });
    
              it("burns value in the parent position", async function() {
                const positionId = getPositionId(collateralToken.address, parentCollectionId);
                expect(await conditionalTokens.balanceOf(trader.address, positionId)).to.equal(collateralTokenCount.sub(deepSplitAmount));
              });
    
              it("mints values in the child positions", async function() {
                for (const indexSet of partition2) {
                  const childCollectionId = combineCollectionIds([
                    parentCollectionId,
                    getCollectionId(conditionId2, indexSet)
                  ]);
                  const positionId = getPositionId(collateralToken.address, childCollectionId);
    
                  expect(await conditionalTokens.balanceOf(trader.address, positionId)).to.equal(deepSplitAmount);
                }
              });
            });
    
            context("with valid report", function() {
              beforeEach(async function() {
                this.reportTx = await conditionalTokens.connect(oracle).reportPayouts(
                  condition.questionId,
                  finalReport
                );
              });
    
              it("should emit ConditionResolution event", async function() {
                await expect(this.reportTx)
                  .to.emit(conditionalTokens, "ConditionResolution")
                  .withArgs(
                    condition.id,
                    oracle.address,
                    condition.questionId,
                    condition.outcomeSlotCount,
                    finalReport
                  );
              });
    
              it("should reflect report via payoutNumerators", async function() {
                for (let i = 0; i < finalReport.length; i++) {
                  expect(await conditionalTokens.payoutNumerators(condition.id, i)).to.equal(finalReport[i]);
                }
              });
    
              it("should not allow an update to the report", async function() {
                const badUpdateReport = finalReport.map((x, i) => i === 1 ? x : ethers.BigNumber.from(0));
                
                await expect(
                  conditionalTokens.connect(oracle).reportPayouts(
                    condition.questionId,
                    badUpdateReport
                  )
                ).to.be.revertedWith("payout denominator already set");
              });
    
              context("with valid redemption", async function() {
                const payout = collateralTokenCount
                  .mul(finalReport.reduce((acc, term, i) => positionIndexSet & (1 << i) ? acc.add(term) : acc, ethers.BigNumber.from(0)))
                  .div(payoutDenominator);
    
                beforeEach(async function() {
                  this.redeemTx = await trader.redeemPositions(
                    collateralToken.address,
                    NULL_BYTES32,
                    condition.id,
                    [positionIndexSet]
                  );
                });
    
                it("should emit PayoutRedemption event", async function() {
                  await expect(this.redeemTx)
                    .to.emit(conditionalTokens, "PayoutRedemption")
                    .withArgs(
                      trader.address,
                      collateralToken.address,
                      NULL_BYTES32,
                      condition.id,
                      [positionIndexSet],
                      payout
                    );
                });
              });
            });
          });
        });
      })
    }
  });
});
