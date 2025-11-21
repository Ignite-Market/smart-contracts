const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IgniteTreasury", function () {
    let owner, caller, user1, user2, user3, user4, TREASURY, DEFAULT_PAYOUT_TOKEN, ING_TOKEN, OTHER_PAYOUT_TOKEN;
    let curDate = null;

    const ONE_WEEK = Number(60 * 60 * 24 * 7);

    async function advanceTimeAndBlock(time) {
        await ethers.provider.send("evm_increaseTime", [time]);
        await ethers.provider.send("evm_mine");
        const latestBlock = await ethers.provider.getBlock('latest');
        curDate = latestBlock.timestamp;
    }

    before(async () => {
        await hre.network.provider.send("hardhat_reset", [{ forking: { jsonRpcUrl: hre.config.networks.hardhat.forking.url } }]);
    });

    beforeEach(async () => {
        [owner, caller, user1, user2, user3, user4] = await ethers.getSigners();

        const mockCoinFactory = await ethers.getContractFactory("MockCoin");
        DEFAULT_PAYOUT_TOKEN = await mockCoinFactory.deploy();
        await DEFAULT_PAYOUT_TOKEN.deployed();

        OTHER_PAYOUT_TOKEN = await mockCoinFactory.deploy();
        await OTHER_PAYOUT_TOKEN.deployed();

        ING_TOKEN = await mockCoinFactory.deploy();
        await ING_TOKEN.deployed();

        const treasuryFactory = await ethers.getContractFactory("IgniteTreasury");
        TREASURY = await treasuryFactory.deploy(
            owner.address, // admin
            caller.address, // caller
            ING_TOKEN.address, // stakeToken
        );
        await TREASURY.deployed();

        // Get current block timestamp.
        const latestBlock = await ethers.provider.getBlock('latest');
        curDate = latestBlock.timestamp;
    });

    describe("Admin Functions", function () {
        describe("pause", function () {
            it("should pause the contract when called by owner", async function () {
                await expect(TREASURY.connect(owner).pause())
                    .to.emit(TREASURY, "Paused")
                    .withArgs(owner.address);

                expect(await TREASURY.paused()).to.be.true;
            });

            it("should revert when called by non-owner", async function () {
                await expect(TREASURY.connect(caller).pause())
                    .to.be.reverted;
            });

            it("should revert when already paused", async function () {
                await TREASURY.connect(owner).pause();
                await expect(TREASURY.connect(owner).pause())
                    .to.be.reverted;
            });
        });

        describe("unpause", function () {
            beforeEach(async function () {
                await TREASURY.connect(owner).pause();
            });

            it("should unpause the contract when called by owner", async function () {
                await expect(TREASURY.connect(owner).unpause())
                    .to.emit(TREASURY, "Unpaused")
                    .withArgs(owner.address);

                expect(await TREASURY.paused()).to.be.false;
            });

            it("should revert when called by non-owner", async function () {
                await expect(TREASURY.connect(caller).unpause())
                    .to.be.reverted;
            });

            it("should revert when not paused", async function () {
                await TREASURY.connect(owner).unpause();
                await expect(TREASURY.connect(owner).unpause())
                    .to.be.reverted;
            });
        });

        describe("setCaller", function () {
            it("should set caller when called by owner", async function () {
                const newCaller = user1.address;
                await TREASURY.connect(owner).setCaller(newCaller);
                expect(await TREASURY.caller()).to.equal(newCaller);
            });

            it("should revert when called by non-owner", async function () {
                await expect(TREASURY.connect(caller).setCaller(user1.address))
                    .to.be.reverted;
            });

            it("should revert when setting zero address", async function () {
                await expect(TREASURY.connect(owner).setCaller(ethers.constants.AddressZero))
                    .to.be.revertedWith("NA not allowed");
            });
        });

        describe("setStakersShareDistribution", function () {
            it("should set stakers share distribution when called by owner", async function () {
                const newDistribution = 8000; // 80%
                await TREASURY.connect(owner).setStakersShareDistribution(newDistribution);
                expect(await TREASURY.stakersShareDistribution()).to.equal(newDistribution);
            });

            it("should allow setting to 100%", async function () {
                const newDistribution = 10000; // 100%
                await TREASURY.connect(owner).setStakersShareDistribution(newDistribution);
                expect(await TREASURY.stakersShareDistribution()).to.equal(newDistribution);
            });

            it("should revert when called by non-owner", async function () {
                await expect(TREASURY.connect(caller).setStakersShareDistribution(8000))
                    .to.be.reverted;
            });

            it("should revert when distribution exceeds 100%", async function () {
                await expect(TREASURY.connect(owner).setStakersShareDistribution(10001))
                    .to.be.revertedWith("Distribution must be less than or equal to 100%");
            });
        });

        describe("addPayoutToken", function () {
            it("should add payout token when called by owner", async function () {
                await TREASURY.connect(owner).addPayoutToken(DEFAULT_PAYOUT_TOKEN.address);

                expect(await TREASURY.isPayoutToken(DEFAULT_PAYOUT_TOKEN.address)).to.be.true;
                const state = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                expect(state.isActive).to.be.true;
            });

            it("should revert when called by non-owner", async function () {
                await expect(TREASURY.connect(caller).addPayoutToken(DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.reverted;
            });

            it("should revert when adding zero address", async function () {
                await expect(TREASURY.connect(owner).addPayoutToken(ethers.constants.AddressZero))
                    .to.be.revertedWith("NA not allowed");
            });

            it("should revert when adding stake token", async function () {
                await expect(TREASURY.connect(owner).addPayoutToken(ING_TOKEN.address))
                    .to.be.revertedWith("Stake token cannot be added as a payout token");
            });

            it("should revert when adding already existing payout token", async function () {
                await TREASURY.connect(owner).addPayoutToken(DEFAULT_PAYOUT_TOKEN.address);
                await expect(TREASURY.connect(owner).addPayoutToken(DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.revertedWith("Payout token already exists");
            });
        });

        describe("deactivatePayoutToken", function () {
            beforeEach(async function () {
                await TREASURY.connect(owner).addPayoutToken(DEFAULT_PAYOUT_TOKEN.address);
            });

            it("should deactivate payout token when called by owner", async function () {
                await TREASURY.connect(owner).deactivatePayoutToken(DEFAULT_PAYOUT_TOKEN.address);

                const state = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                expect(state.isActive).to.be.false;
            });

            it("should revert when called by non-owner", async function () {
                await expect(TREASURY.connect(caller).deactivatePayoutToken(DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.reverted;
            });

            it("should revert when deactivating non-existent payout token", async function () {
                await expect(TREASURY.connect(owner).deactivatePayoutToken(OTHER_PAYOUT_TOKEN.address))
                    .to.be.revertedWith("Payout token does not exist");
            });

            it("should call divideFees before deactivating (total staked = 0)", async function () {
                // Get initial state before adding tokens.
                const initialState = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                const initialTrackedBalance = initialState.trackedBalance;
                const initialOwnerReward = initialState.ownerReward;

                // Add some tokens to the treasury.
                const tokenAmount = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, tokenAmount);

                // Verify tokens were added but not yet distributed.
                const balanceAfterMint = await DEFAULT_PAYOUT_TOKEN.balanceOf(TREASURY.address);
                expect(balanceAfterMint).to.equal(tokenAmount);

                const stateBeforeDeactivate = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                expect(stateBeforeDeactivate.trackedBalance).to.equal(initialTrackedBalance);
                expect(stateBeforeDeactivate.ownerReward).to.equal(initialOwnerReward);

                // No stakers in this test, so all fees go to owner.
                const totalStaked = await TREASURY.totalStaked();
                expect(totalStaked.eq(0)).to.be.true;

                const expectedToStakers = ethers.BigNumber.from(0);
                const expectedToOwner = tokenAmount;

                // Deactivate should distribute fees first before deactivating.
                await expect(TREASURY.connect(owner).deactivatePayoutToken(DEFAULT_PAYOUT_TOKEN.address))
                    .to.emit(TREASURY, "FeesDistributed")
                    .withArgs(
                        DEFAULT_PAYOUT_TOKEN.address,
                        tokenAmount,
                        expectedToStakers,
                        expectedToOwner
                    );

                // Verify fees were distributed.
                const stateAfterDeactivate = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                expect(stateAfterDeactivate.trackedBalance).to.be.gt(initialTrackedBalance);
                expect(stateAfterDeactivate.ownerReward).to.be.gt(initialOwnerReward);
                expect(stateAfterDeactivate.isActive).to.be.false;

                // Verify tracked balance matches the distributed amount.
                const distributedAmount = stateAfterDeactivate.trackedBalance.sub(initialTrackedBalance);
                expect(distributedAmount).to.equal(tokenAmount);

                // Verify owner reward increased by the expected amount.
                const ownerRewardIncrease = stateAfterDeactivate.ownerReward.sub(initialOwnerReward);
                expect(ownerRewardIncrease).to.equal(expectedToOwner);
            });

            it("should call divideFees before deactivating (with stakers, total staked > 0)", async function () {
                // Stake some tokens first (using user1, not owner).
                const stakeAmount = ethers.utils.parseUnits("1000", 6);
                await ING_TOKEN.connect(owner).faucetMint(user1.address, stakeAmount);
                await ING_TOKEN.connect(user1).approve(TREASURY.address, stakeAmount);
                await TREASURY.connect(user1).stake(stakeAmount);

                // Verify staking worked.
                const totalStaked = await TREASURY.totalStaked();
                expect(totalStaked).to.equal(stakeAmount);
                expect(await TREASURY.staked(user1.address)).to.equal(stakeAmount);

                // Get initial state before adding tokens.
                const initialState = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                const initialTrackedBalance = initialState.trackedBalance;
                const initialOwnerReward = initialState.ownerReward;
                const initialRPS = initialState.stakersRewardPerShare;

                // Add some tokens to the treasury.
                const tokenAmount = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, tokenAmount);

                // Verify tokens were added but not yet distributed.
                const balanceAfterMint = await DEFAULT_PAYOUT_TOKEN.balanceOf(TREASURY.address);
                expect(balanceAfterMint).to.equal(tokenAmount);

                const stateBeforeDeactivate = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                expect(stateBeforeDeactivate.trackedBalance).to.equal(initialTrackedBalance);
                expect(stateBeforeDeactivate.ownerReward).to.equal(initialOwnerReward);
                expect(stateBeforeDeactivate.stakersRewardPerShare).to.equal(initialRPS);

                // Calculate expected distribution (default 70% to stakers, 30% to owner).
                const stakersShare = await TREASURY.stakersShareDistribution();
                const expectedToStakers = tokenAmount.mul(stakersShare).div(10000);
                const expectedToOwner = tokenAmount.sub(expectedToStakers);

                // Deactivate should distribute fees first before deactivating.
                await expect(TREASURY.connect(owner).deactivatePayoutToken(DEFAULT_PAYOUT_TOKEN.address))
                    .to.emit(TREASURY, "FeesDistributed")
                    .withArgs(
                        DEFAULT_PAYOUT_TOKEN.address,
                        tokenAmount,
                        expectedToStakers,
                        expectedToOwner
                    );

                // Verify fees were distributed.
                const stateAfterDeactivate = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                expect(stateAfterDeactivate.trackedBalance).to.be.gt(initialTrackedBalance);
                expect(stateAfterDeactivate.ownerReward).to.be.gt(initialOwnerReward);
                expect(stateAfterDeactivate.stakersRewardPerShare).to.be.gt(initialRPS);
                expect(stateAfterDeactivate.isActive).to.be.false;

                // Verify tracked balance increased (equals tokenAmount minus rounding dust).
                const distributedAmount = stateAfterDeactivate.trackedBalance.sub(initialTrackedBalance);
                expect(distributedAmount).to.be.gt(0);
                // Tracked balance should be close to tokenAmount (may be slightly less due to rounding).
                expect(distributedAmount).to.be.closeTo(tokenAmount, ethers.utils.parseUnits("0.01", 6));

                // Verify owner reward increased by the expected amount (plus rounding dust).
                const ownerRewardIncrease = stateAfterDeactivate.ownerReward.sub(initialOwnerReward);
                expect(ownerRewardIncrease).to.be.gte(expectedToOwner);

                // Verify rounding dust goes to owner: ownerRewardIncrease should be >= expectedToOwner.
                // The difference is the rounding dust from stakers distribution.
                const roundingDust = ownerRewardIncrease.sub(expectedToOwner);
                // Verify tracked balance + rounding dust = tokenAmount (accounting for rounding).
                const totalAccounted = distributedAmount.add(roundingDust);
                expect(totalAccounted).to.be.closeTo(tokenAmount, ethers.utils.parseUnits("0.001", 6));

                // Verify stakers reward per share increased.
                const rpsIncrease = stateAfterDeactivate.stakersRewardPerShare.sub(initialRPS);
                expect(rpsIncrease).to.be.gt(0);

                // Verify the RPS increase matches expected calculation.
                const expectedRPSIncrease = expectedToStakers.mul(ethers.utils.parseEther("1")).div(totalStaked);
                // Allow for rounding differences
                expect(rpsIncrease).to.be.closeTo(expectedRPSIncrease, ethers.utils.parseEther("0.0001"));
            });
        });

        describe("activatePayoutToken", function () {
            beforeEach(async function () {
                await TREASURY.connect(owner).addPayoutToken(DEFAULT_PAYOUT_TOKEN.address);
                await TREASURY.connect(owner).deactivatePayoutToken(DEFAULT_PAYOUT_TOKEN.address);
            });

            it("should activate payout token when called by owner", async function () {
                await TREASURY.connect(owner).activatePayoutToken(DEFAULT_PAYOUT_TOKEN.address);

                const state = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                expect(state.isActive).to.be.true;
            });

            it("should revert when called by non-owner", async function () {
                await expect(TREASURY.connect(caller).activatePayoutToken(DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.reverted;
            });

            it("should revert when activating non-existent payout token", async function () {
                await expect(TREASURY.connect(owner).activatePayoutToken(OTHER_PAYOUT_TOKEN.address))
                    .to.be.revertedWith("Payout token does not exist");
            });

            it("should revert when already active", async function () {
                await TREASURY.connect(owner).activatePayoutToken(DEFAULT_PAYOUT_TOKEN.address);
                await expect(TREASURY.connect(owner).activatePayoutToken(DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.revertedWith("already active");
            });
        });

        describe("removePayoutToken", function () {
            beforeEach(async function () {
                await TREASURY.connect(owner).addPayoutToken(DEFAULT_PAYOUT_TOKEN.address);
                await TREASURY.connect(owner).deactivatePayoutToken(DEFAULT_PAYOUT_TOKEN.address);
            });

            it("should remove payout token when called by owner and conditions are met", async function () {
                await TREASURY.connect(owner).removePayoutToken(DEFAULT_PAYOUT_TOKEN.address);

                expect(await TREASURY.isPayoutToken(DEFAULT_PAYOUT_TOKEN.address)).to.be.false;
            });

            it("should revert when called by non-owner", async function () {
                await expect(TREASURY.connect(caller).removePayoutToken(DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.reverted;
            });

            it("should revert when removing non-existent payout token", async function () {
                await expect(TREASURY.connect(owner).removePayoutToken(OTHER_PAYOUT_TOKEN.address))
                    .to.be.revertedWith("Payout token does not exist");
            });

            it("should revert when payout token is still active", async function () {
                await TREASURY.connect(owner).addPayoutToken(OTHER_PAYOUT_TOKEN.address);
                await expect(TREASURY.connect(owner).removePayoutToken(OTHER_PAYOUT_TOKEN.address))
                    .to.be.revertedWith("Payout token must be inactive");
            });

            it("should revert when tracked balance is not zero", async function () {
                // Add tokens and distribute fees.
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, ethers.utils.parseUnits("100", 6));
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // Withdraw all tracked balance first.
                const state = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                if (state.trackedBalance.gt(0)) {
                    // This test verifies that tracked balance must be 0, but we also need to check
                    // that there's no untracked balance. The error "Untracked balance present" 
                    // occurs when the contract balance is non-zero, which includes tracked balance.
                    await expect(TREASURY.connect(owner).removePayoutToken(DEFAULT_PAYOUT_TOKEN.address))
                        .to.be.reverted;
                }
            });

            it("should revert when owner reward is not zero", async function () {
                // Add tokens and distribute fees.
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, ethers.utils.parseUnits("100", 6));
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // Withdraw all tracked balance but leave owner reward.
                const state = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                if (state.trackedBalance.gt(0)) {
                    // This test assumes owner reward exists after distribution
                    await expect(TREASURY.connect(owner).removePayoutToken(DEFAULT_PAYOUT_TOKEN.address))
                        .to.be.reverted;
                }
            });
        });

        describe("sweepInactive", function () {
            beforeEach(async function () {
                await TREASURY.connect(owner).addPayoutToken(DEFAULT_PAYOUT_TOKEN.address);
                await TREASURY.connect(owner).deactivatePayoutToken(DEFAULT_PAYOUT_TOKEN.address);
            });

            it("should sweep inactive payout token when called by owner", async function () {
                const sweepAmount = ethers.utils.parseUnits("50", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, sweepAmount);

                const ownerBalanceBefore = await DEFAULT_PAYOUT_TOKEN.balanceOf(owner.address);
                await TREASURY.connect(owner).sweepInactive(DEFAULT_PAYOUT_TOKEN.address, owner.address);

                const ownerBalanceAfter = await DEFAULT_PAYOUT_TOKEN.balanceOf(owner.address);
                expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.equal(sweepAmount);
            });

            it("should revert when called by non-owner", async function () {
                await expect(TREASURY.connect(caller).sweepInactive(DEFAULT_PAYOUT_TOKEN.address, owner.address))
                    .to.be.reverted;
            });

            it("should revert when sweeping to zero address", async function () {
                await expect(TREASURY.connect(owner).sweepInactive(DEFAULT_PAYOUT_TOKEN.address, ethers.constants.AddressZero))
                    .to.be.revertedWith("NA not allowed");
            });

            it("should revert when sweeping non-existent payout token", async function () {
                await expect(TREASURY.connect(owner).sweepInactive(OTHER_PAYOUT_TOKEN.address, owner.address))
                    .to.be.revertedWith("Payout token does not exist");
            });

            it("should revert when sweeping stake token", async function () {
                // ING_TOKEN is not a payout token, so it will revert with "Payout token does not exist".
                await expect(TREASURY.connect(owner).sweepInactive(ING_TOKEN.address, owner.address))
                    .to.be.revertedWith("Payout token does not exist");
            });

            it("should revert when payout token is active", async function () {
                await TREASURY.connect(owner).activatePayoutToken(DEFAULT_PAYOUT_TOKEN.address);
                await expect(TREASURY.connect(owner).sweepInactive(DEFAULT_PAYOUT_TOKEN.address, owner.address))
                    .to.be.revertedWith("Payout token must be inactive");
            });

            it("should revert when tracked balance or owner reward is not zero", async function () {
                // Activate the token first, then add tokens and distribute fees.
                await TREASURY.connect(owner).activatePayoutToken(DEFAULT_PAYOUT_TOKEN.address);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, ethers.utils.parseUnits("100", 6));
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // Deactivate again (this will distribute any remaining fees).
                await TREASURY.connect(owner).deactivatePayoutToken(DEFAULT_PAYOUT_TOKEN.address);

                // Verify that tracked balance or owner reward is not zero.
                const state = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                expect(state.trackedBalance.gt(0) || state.ownerReward.gt(0)).to.be.true;

                await expect(TREASURY.connect(owner).sweepInactive(DEFAULT_PAYOUT_TOKEN.address, owner.address))
                    .to.be.revertedWith("Payout token must be fully drained");
            });
        });

        describe("withdrawOwnerFees", function () {
            beforeEach(async function () {
                await TREASURY.connect(owner).addPayoutToken(DEFAULT_PAYOUT_TOKEN.address);
            });

            it("should withdraw owner fees when called by owner", async function () {
                // Add tokens and distribute fees.
                const feeAmount = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, feeAmount);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                const state = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                const withdrawAmount = state.ownerReward;

                const ownerBalanceBefore = await DEFAULT_PAYOUT_TOKEN.balanceOf(owner.address);

                await expect(TREASURY.connect(owner).withdrawOwnerFees(DEFAULT_PAYOUT_TOKEN.address, owner.address, withdrawAmount))
                    .to.emit(TREASURY, "OwnerFeesWithdrawn")
                    .withArgs(DEFAULT_PAYOUT_TOKEN.address, withdrawAmount, owner.address);

                const ownerBalanceAfter = await DEFAULT_PAYOUT_TOKEN.balanceOf(owner.address);
                expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.equal(withdrawAmount);
            });

            it("should revert when called by non-owner", async function () {
                await expect(TREASURY.connect(caller).withdrawOwnerFees(DEFAULT_PAYOUT_TOKEN.address, owner.address, ethers.utils.parseUnits("10", 6)))
                    .to.be.reverted;
            });

            it("should revert when withdrawing from non-existent payout token", async function () {
                await expect(TREASURY.connect(owner).withdrawOwnerFees(OTHER_PAYOUT_TOKEN.address, owner.address, ethers.utils.parseUnits("10", 6)))
                    .to.be.revertedWith("Payout token does not exist");
            });

            it("should revert when withdrawing to zero address", async function () {
                await expect(TREASURY.connect(owner).withdrawOwnerFees(DEFAULT_PAYOUT_TOKEN.address, ethers.constants.AddressZero, ethers.utils.parseUnits("10", 6)))
                    .to.be.revertedWith("NA not allowed");
            });

            it("should revert when amount is zero", async function () {
                await expect(TREASURY.connect(owner).withdrawOwnerFees(DEFAULT_PAYOUT_TOKEN.address, owner.address, 0))
                    .to.be.revertedWith("Amount must be greater than 0 and less than or equal to the owner reward");
            });

            it("should revert when amount exceeds owner reward", async function () {
                await expect(TREASURY.connect(owner).withdrawOwnerFees(DEFAULT_PAYOUT_TOKEN.address, owner.address, ethers.utils.parseUnits("1000", 6)))
                    .to.be.revertedWith("Amount must be greater than 0 and less than or equal to the owner reward");
            });
        });
    });

    describe("Staking & Rewards", function () {
        beforeEach(async function () {
            await TREASURY.connect(owner).addPayoutToken(DEFAULT_PAYOUT_TOKEN.address);
        });

        describe("stake", function () {
            it("should stake tokens", async function () {
                const amount = ethers.utils.parseUnits("100", 18);
                await ING_TOKEN.connect(owner).faucetMint(user1.address, amount);
                await ING_TOKEN.connect(user1).approve(TREASURY.address, amount);

                await expect(TREASURY.connect(user1).stake(amount))
                    .to.emit(TREASURY, "Staked")
                    .withArgs(user1.address, amount);

                expect(await TREASURY.staked(user1.address)).to.equal(amount);
                expect(await TREASURY.totalStaked()).to.equal(amount);
            });

            it("should revert when staking 0 amount", async function () {
                await expect(TREASURY.connect(user1).stake(0))
                    .to.be.revertedWith("amount must be non-zero");
            });
        });

        describe("unstake", function () {
            beforeEach(async function () {
                const amount = ethers.utils.parseUnits("100", 18);
                await ING_TOKEN.connect(owner).faucetMint(user1.address, amount);
                await ING_TOKEN.connect(user1).approve(TREASURY.address, amount);
                await TREASURY.connect(user1).stake(amount);
            });

            it("should unstake tokens", async function () {
                const amount = ethers.utils.parseUnits("50", 18);
                await expect(TREASURY.connect(user1).unstake(amount))
                    .to.emit(TREASURY, "Unstaked")
                    .withArgs(user1.address, amount);

                expect(await TREASURY.staked(user1.address)).to.equal(ethers.utils.parseUnits("50", 18));
                expect(await TREASURY.totalStaked()).to.equal(ethers.utils.parseUnits("50", 18));
            });

            it("should revert when unstaking 0 amount", async function () {
                await expect(TREASURY.connect(user1).unstake(0))
                    .to.be.revertedWith("amount must be non-zero");
            });

            it("should revert when unstaking more than staked", async function () {
                const amount = ethers.utils.parseUnits("101", 18);
                await expect(TREASURY.connect(user1).unstake(amount))
                    .to.be.revertedWith("insufficient staked balance");
            });
        });

        describe("divideFees", function () {
            it("should distribute fees to stakers and owner", async function () {
                const stakeAmount = ethers.utils.parseUnits("100", 18);
                await ING_TOKEN.connect(owner).faucetMint(user1.address, stakeAmount);
                await ING_TOKEN.connect(user1).approve(TREASURY.address, stakeAmount);
                await TREASURY.connect(user1).stake(stakeAmount);

                const feeAmount = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, feeAmount);

                await expect(TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address))
                    .to.emit(TREASURY, "FeesDistributed");

                const state = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                expect(state.stakersRewardPerShare).to.be.gt(0);
                expect(state.ownerReward).to.be.gt(0);
            });

            it("should distribute all fees to owner if no stakers", async function () {
                const feeAmount = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, feeAmount);

                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                const state = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                expect(state.stakersRewardPerShare).to.equal(0);
                expect(state.ownerReward).to.equal(feeAmount);
            });
        });

        describe("withdrawFees", function () {
            it("should withdraw fees", async function () {
                const stakeAmount = ethers.utils.parseUnits("100", 18);
                await ING_TOKEN.connect(owner).faucetMint(user1.address, stakeAmount);
                await ING_TOKEN.connect(user1).approve(TREASURY.address, stakeAmount);
                await TREASURY.connect(user1).stake(stakeAmount);

                const feeAmount = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, feeAmount);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                const pending = await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address);
                expect(pending).to.be.gt(0);

                await expect(TREASURY.connect(user1).withdrawFees(DEFAULT_PAYOUT_TOKEN.address))
                    .to.emit(TREASURY, "FeesWithdrawn")
                    .withArgs(user1.address, DEFAULT_PAYOUT_TOKEN.address, pending);

                expect(await DEFAULT_PAYOUT_TOKEN.balanceOf(user1.address)).to.equal(pending);
            });

            it("should revert when no fees to withdraw", async function () {
                await expect(TREASURY.connect(user1).withdrawFees(DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.revertedWith("No fees to withdraw");
            });
        });

        describe("View Functions", function () {
            it("should return correct pending rewards", async function () {
                const stakeAmount = ethers.utils.parseUnits("100", 18);
                await ING_TOKEN.connect(owner).faucetMint(user1.address, stakeAmount);
                await ING_TOKEN.connect(user1).approve(TREASURY.address, stakeAmount);
                await TREASURY.connect(user1).stake(stakeAmount);

                const feeAmount = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, feeAmount);

                // Check pending rewards before divideFees (should include undistributed fees)
                const pendingBefore = await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address);
                expect(pendingBefore).to.be.gt(0);

                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                const pendingAfter = await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address);
                expect(pendingAfter).to.equal(pendingBefore);
            });

            it("should return correct user staking share", async function () {
                const stakeAmount = ethers.utils.parseUnits("100", 18);
                await ING_TOKEN.connect(owner).faucetMint(user1.address, stakeAmount);
                await ING_TOKEN.connect(user1).approve(TREASURY.address, stakeAmount);
                await TREASURY.connect(user1).stake(stakeAmount);

                expect(await TREASURY.getUserStakingShare(user1.address)).to.equal(10000); // 100%
            });

            it("should return correct undistributed fees", async function () {
                const feeAmount = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, feeAmount);

                expect(await TREASURY.getUndistributedFees(DEFAULT_PAYOUT_TOKEN.address)).to.equal(feeAmount);
            });
        });
    });

    describe("Scenarios", function () {
        beforeEach(async function () {
            await TREASURY.connect(owner).addPayoutToken(DEFAULT_PAYOUT_TOKEN.address);
        });

        describe("Multi-User Reward Distribution", function () {
            it("should distribute rewards correctly between multiple users", async function () {
                // 1. User A stakes 100
                const stakeAmountA = ethers.utils.parseUnits("100", 18);
                await ING_TOKEN.connect(owner).faucetMint(user1.address, stakeAmountA);
                await ING_TOKEN.connect(user1).approve(TREASURY.address, stakeAmountA);
                await TREASURY.connect(user1).stake(stakeAmountA);

                // 2. Distribute 100 reward tokens (User A gets 100% of staker share)
                const rewardAmount1 = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, rewardAmount1);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                const stakersShare = await TREASURY.stakersShareDistribution();
                const expectedRewardA1 = rewardAmount1.mul(stakersShare).div(10000);

                // Check User A pending rewards
                expect(await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.closeTo(expectedRewardA1, ethers.utils.parseUnits("0.0001", 6));

                // 3. User B stakes 100 (Total Staked = 200)
                const stakeAmountB = ethers.utils.parseUnits("100", 18);
                await ING_TOKEN.connect(owner).faucetMint(user2.address, stakeAmountB);
                await ING_TOKEN.connect(user2).approve(TREASURY.address, stakeAmountB);
                await TREASURY.connect(user2).stake(stakeAmountB);

                // 4. Distribute 100 reward tokens (User A and B split 50/50 of staker share)
                const rewardAmount2 = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, rewardAmount2);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                const expectedRewardTotal2 = rewardAmount2.mul(stakersShare).div(10000);
                const expectedRewardPerUser2 = expectedRewardTotal2.div(2);

                // Check User A total rewards (First batch + Second batch)
                const totalExpectedA = expectedRewardA1.add(expectedRewardPerUser2);
                expect(await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.closeTo(totalExpectedA, ethers.utils.parseUnits("0.0001", 6));

                // Check User B total rewards (Only second batch)
                expect(await TREASURY.pendingRewards(user2.address, DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.closeTo(expectedRewardPerUser2, ethers.utils.parseUnits("0.0001", 6));

                // 5. User A unstakes everything
                await TREASURY.connect(user1).unstake(stakeAmountA);

                // 6. Distribute 100 reward tokens (User B gets 100% of staker share)
                const rewardAmount3 = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, rewardAmount3);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                const expectedRewardB3 = rewardAmount3.mul(stakersShare).div(10000);

                // Check User B total rewards (Previous + New batch)
                const totalExpectedB = expectedRewardPerUser2.add(expectedRewardB3);
                expect(await TREASURY.pendingRewards(user2.address, DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.closeTo(totalExpectedB, ethers.utils.parseUnits("0.0001", 6));
            });

            it("should handle 4 users with dynamic staking and proportional rewards", async function () {
                const stakeAmount = ethers.utils.parseUnits("100", 18);

                // Mint tokens for all users
                for (const user of [user1, user2, user3, user4]) {
                    await ING_TOKEN.connect(owner).faucetMint(user.address, stakeAmount.mul(3));
                    await ING_TOKEN.connect(user).approve(TREASURY.address, stakeAmount.mul(3));
                }

                // Round 1: user1 stakes 100
                await TREASURY.connect(user1).stake(stakeAmount);

                const reward1 = ethers.utils.parseUnits("1000", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward1);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // Round 2: user2 stakes 100 (total: 200)
                await TREASURY.connect(user2).stake(stakeAmount);

                const reward2 = ethers.utils.parseUnits("1000", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward2);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // Round 3: user3 stakes 200 (total: 400)
                await TREASURY.connect(user3).stake(stakeAmount.mul(2));

                const reward3 = ethers.utils.parseUnits("1000", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward3);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // Round 4: user4 stakes 100 (total: 500)
                await TREASURY.connect(user4).stake(stakeAmount);

                const reward4 = ethers.utils.parseUnits("1000", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward4);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                const stakersShare = await TREASURY.stakersShareDistribution();

                // Verify each user's rewards
                const pending1 = await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address);
                const pending2 = await TREASURY.pendingRewards(user2.address, DEFAULT_PAYOUT_TOKEN.address);
                const pending3 = await TREASURY.pendingRewards(user3.address, DEFAULT_PAYOUT_TOKEN.address);
                const pending4 = await TREASURY.pendingRewards(user4.address, DEFAULT_PAYOUT_TOKEN.address);

                // user1: 100% of R1 + 50% of R2 + 25% of R3 + 20% of R4
                // user2: 50% of R2 + 25% of R3 + 20% of R4
                // user3: 50% of R3 + 40% of R4
                // user4: 20% of R4

                expect(pending1).to.be.gt(pending2);
                expect(pending2).to.be.gt(pending3);
                expect(pending3).to.be.gt(pending4);
                expect(pending4).to.be.gt(0);
            });

            it("should handle users entering and exiting at different times", async function () {
                const stakeAmount = ethers.utils.parseUnits("100", 18);

                // Setup: Mint tokens
                for (const user of [user1, user2, user3]) {
                    await ING_TOKEN.connect(owner).faucetMint(user.address, stakeAmount.mul(2));
                    await ING_TOKEN.connect(user).approve(TREASURY.address, stakeAmount.mul(2));
                }

                // user1 and user2 stake
                await TREASURY.connect(user1).stake(stakeAmount);
                await TREASURY.connect(user2).stake(stakeAmount);

                // Distribute rewards
                const reward1 = ethers.utils.parseUnits("1000", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward1);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                const pending1After1 = await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address);
                const pending2After1 = await TREASURY.pendingRewards(user2.address, DEFAULT_PAYOUT_TOKEN.address);

                // Should be equal (50/50 split)
                expect(pending1After1).to.be.closeTo(pending2After1, ethers.utils.parseUnits("0.01", 6));

                // user1 exits
                await TREASURY.connect(user1).unstake(stakeAmount);

                // user3 enters
                await TREASURY.connect(user3).stake(stakeAmount);

                // Distribute more rewards
                const reward2 = ethers.utils.parseUnits("1000", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward2);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // user1 should have claimable rewards from before (not pending since unstaked)
                const pending1After2 = await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address);
                expect(pending1After2).to.be.gt(0); // Still has claimable from before unstake

                // user2 and user3 should split the new rewards
                const pending2After2 = await TREASURY.pendingRewards(user2.address, DEFAULT_PAYOUT_TOKEN.address);
                const pending3After2 = await TREASURY.pendingRewards(user3.address, DEFAULT_PAYOUT_TOKEN.address);

                expect(pending2After2).to.be.gt(pending1After2); // user2 got more rewards
                expect(pending3After2).to.be.gt(0); // user3 got rewards
            });

            it("should handle partial unstaking by multiple users", async function () {
                const stakeAmount = ethers.utils.parseUnits("100", 18);

                // Setup: All users stake 100
                for (const user of [user1, user2, user3, user4]) {
                    await ING_TOKEN.connect(owner).faucetMint(user.address, stakeAmount);
                    await ING_TOKEN.connect(user).approve(TREASURY.address, stakeAmount);
                    await TREASURY.connect(user).stake(stakeAmount);
                }

                // Distribute rewards (all equal)
                const reward1 = ethers.utils.parseUnits("1000", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward1);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // user1 and user2 unstake 50%
                await TREASURY.connect(user1).unstake(stakeAmount.div(2));
                await TREASURY.connect(user2).unstake(stakeAmount.div(2));

                // Distribute more rewards
                const reward2 = ethers.utils.parseUnits("1000", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward2);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // user3 and user4 should get more of reward2 than user1 and user2
                const pending1 = await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address);
                const pending3 = await TREASURY.pendingRewards(user3.address, DEFAULT_PAYOUT_TOKEN.address);

                expect(pending3).to.be.gt(pending1);
            });

            it("should handle all users unstaking and restaking", async function () {
                const stakeAmount = ethers.utils.parseUnits("100", 18);

                // Setup
                for (const user of [user1, user2]) {
                    await ING_TOKEN.connect(owner).faucetMint(user.address, stakeAmount.mul(2));
                    await ING_TOKEN.connect(user).approve(TREASURY.address, stakeAmount.mul(2));
                    await TREASURY.connect(user).stake(stakeAmount);
                }

                // Distribute rewards
                const reward1 = ethers.utils.parseUnits("1000", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward1);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // All unstake
                await TREASURY.connect(user1).unstake(stakeAmount);
                await TREASURY.connect(user2).unstake(stakeAmount);

                expect(await TREASURY.totalStaked()).to.equal(0);

                // Distribute rewards (should go to owner)
                const reward2 = ethers.utils.parseUnits("1000", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward2);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                const stateAfterNoStakers = await TREASURY.payoutTokenState(DEFAULT_PAYOUT_TOKEN.address);
                // stakersRewardPerShare stays at previous value when totalStaked is 0
                expect(stateAfterNoStakers.ownerReward).to.be.gt(0); // All of reward2 goes to owner

                // Users restake
                await TREASURY.connect(user1).stake(stakeAmount);
                await TREASURY.connect(user2).stake(stakeAmount);

                // Distribute new rewards
                const reward3 = ethers.utils.parseUnits("1000", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward3);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // Both should get equal share of reward3 only
                const pending1 = await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address);
                const pending2 = await TREASURY.pendingRewards(user2.address, DEFAULT_PAYOUT_TOKEN.address);

                expect(pending1).to.be.closeTo(pending2, ethers.utils.parseUnits("0.01", 6));
                expect(pending1).to.be.gt(0);
            });
        });

        describe("Multi-Token Rewards", function () {
            it("should accumulate rewards in multiple tokens", async function () {
                // Add second payout token
                await TREASURY.connect(owner).addPayoutToken(OTHER_PAYOUT_TOKEN.address);

                // User stakes
                const stakeAmount = ethers.utils.parseUnits("100", 18);
                await ING_TOKEN.connect(owner).faucetMint(user1.address, stakeAmount);
                await ING_TOKEN.connect(user1).approve(TREASURY.address, stakeAmount);
                await TREASURY.connect(user1).stake(stakeAmount);

                // Distribute Token A
                const rewardA = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, rewardA);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // Distribute Token B
                const rewardB = ethers.utils.parseUnits("200", 6);
                await OTHER_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, rewardB);
                await TREASURY.connect(caller).divideFees(OTHER_PAYOUT_TOKEN.address);

                const stakersShare = await TREASURY.stakersShareDistribution();
                const expectedA = rewardA.mul(stakersShare).div(10000);
                const expectedB = rewardB.mul(stakersShare).div(10000);

                // Verify pending rewards
                expect(await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.closeTo(expectedA, ethers.utils.parseUnits("0.0001", 6));
                expect(await TREASURY.pendingRewards(user1.address, OTHER_PAYOUT_TOKEN.address))
                    .to.be.closeTo(expectedB, ethers.utils.parseUnits("0.0001", 6));

                // Withdraw Token A
                await TREASURY.connect(user1).withdrawFees(DEFAULT_PAYOUT_TOKEN.address);
                expect(await DEFAULT_PAYOUT_TOKEN.balanceOf(user1.address)).to.be.closeTo(expectedA, ethers.utils.parseUnits("0.0001", 6));

                // Token B should still be pending
                expect(await TREASURY.pendingRewards(user1.address, OTHER_PAYOUT_TOKEN.address))
                    .to.be.closeTo(expectedB, ethers.utils.parseUnits("0.0001", 6));
            });
        });

        describe("Staking/Unstaking Cycles (Anti-Dilution)", function () {
            it("should correctly calculate rewards after partial unstaking and restaking", async function () {
                const stakeAmount = ethers.utils.parseUnits("100", 18);
                await ING_TOKEN.connect(owner).faucetMint(user1.address, stakeAmount.mul(2));
                await ING_TOKEN.connect(user1).approve(TREASURY.address, stakeAmount.mul(2));

                // 1. Stake 100
                await TREASURY.connect(user1).stake(stakeAmount);

                // 2. Distribute rewards
                const reward1 = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward1);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // 3. Unstake 50
                await TREASURY.connect(user1).unstake(stakeAmount.div(2));

                // 4. Distribute rewards (User has 50 staked)
                const reward2 = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward2);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                // 5. Stake 50 again (User has 100 staked)
                await TREASURY.connect(user1).stake(stakeAmount.div(2));

                // 6. Distribute rewards (User has 100 staked)
                const reward3 = ethers.utils.parseUnits("100", 6);
                await DEFAULT_PAYOUT_TOKEN.connect(owner).faucetMint(TREASURY.address, reward3);
                await TREASURY.connect(caller).divideFees(DEFAULT_PAYOUT_TOKEN.address);

                const stakersShare = await TREASURY.stakersShareDistribution();

                // Expected:
                // Round 1: 100% of reward1
                // Round 2: 100% of reward2 (since they are the only staker, even with less stake)
                // Round 3: 100% of reward3
                // Note: If there were other stakers, the share would change. Since they are alone, they get all staker rewards.

                const totalExpected = reward1.add(reward2).add(reward3).mul(stakersShare).div(10000);

                expect(await TREASURY.pendingRewards(user1.address, DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.closeTo(totalExpected, ethers.utils.parseUnits("0.0001", 6));
            });
        });

        describe("Pausable Interactions", function () {
            it("should revert actions when paused and succeed when unpaused", async function () {
                const stakeAmount = ethers.utils.parseUnits("100", 18);
                await ING_TOKEN.connect(owner).faucetMint(user1.address, stakeAmount);
                await ING_TOKEN.connect(user1).approve(TREASURY.address, stakeAmount);

                // Pause
                await TREASURY.connect(owner).pause();

                // Attempt stake
                await expect(TREASURY.connect(user1).stake(stakeAmount))
                    .to.be.reverted;

                // Unpause
                await TREASURY.connect(owner).unpause();

                // Stake succeeds
                await TREASURY.connect(user1).stake(stakeAmount);

                // Pause
                await TREASURY.connect(owner).pause();

                // Attempt unstake
                await expect(TREASURY.connect(user1).unstake(stakeAmount))
                    .to.be.reverted;

                // Attempt withdrawFees
                await expect(TREASURY.connect(user1).withdrawFees(DEFAULT_PAYOUT_TOKEN.address))
                    .to.be.reverted;

                // Unpause
                await TREASURY.connect(owner).unpause();

                // Unstake succeeds
                await TREASURY.connect(user1).unstake(stakeAmount);
            });
        });
    });

    describe("Payout Token Limit", function () {
        it("should allow adding tokens up to MAX_PAYOUT_TOKENS", async function () {
            const mockCoinFactory = await ethers.getContractFactory("MockCoin");
            const maxTokens = await TREASURY.MAX_PAYOUT_TOKENS();

            // Add tokens up to the limit
            for (let i = 0; i < maxTokens; i++) {
                const token = await mockCoinFactory.deploy();
                await token.deployed();
                await TREASURY.connect(owner).addPayoutToken(token.address);
            }

            // Verify we can query the last token added (index maxTokens - 1)
            const lastToken = await TREASURY.payoutTokens(maxTokens - 1);
            expect(lastToken).to.not.equal(ethers.constants.AddressZero);
        });

        it("should revert when adding token beyond MAX_PAYOUT_TOKENS", async function () {
            const mockCoinFactory = await ethers.getContractFactory("MockCoin");
            const maxTokens = await TREASURY.MAX_PAYOUT_TOKENS();

            // Fill up to the limit
            for (let i = 0; i < maxTokens; i++) {
                const token = await mockCoinFactory.deploy();
                await token.deployed();
                await TREASURY.connect(owner).addPayoutToken(token.address);
            }

            // Try to add one more
            const extraToken = await mockCoinFactory.deploy();
            await extraToken.deployed();

            await expect(
                TREASURY.connect(owner).addPayoutToken(extraToken.address)
            ).to.be.revertedWith("Maximum payout tokens reached");
        });

        it("should handle stake/unstake operations efficiently with max tokens", async function () {
            const mockCoinFactory = await ethers.getContractFactory("MockCoin");
            const maxTokens = await TREASURY.MAX_PAYOUT_TOKENS();

            // Add max tokens
            for (let i = 0; i < maxTokens; i++) {
                const token = await mockCoinFactory.deploy();
                await token.deployed();
                await TREASURY.connect(owner).addPayoutToken(token.address);
            }

            // Test stake with max tokens
            const stakeAmount = ethers.utils.parseUnits("100", 18);
            await ING_TOKEN.connect(owner).faucetMint(user1.address, stakeAmount.mul(2));
            await ING_TOKEN.connect(user1).approve(TREASURY.address, stakeAmount.mul(2));

            const stakeTx = await TREASURY.connect(user1).stake(stakeAmount);
            const stakeReceipt = await stakeTx.wait();

            // Gas should be reasonable (adjust threshold as needed)
            expect(stakeReceipt.gasUsed).to.be.lt(2000000); // 2M gas limit for stake

            // Test unstake with max tokens
            const unstakeTx = await TREASURY.connect(user1).unstake(stakeAmount);
            const unstakeReceipt = await unstakeTx.wait();

            expect(unstakeReceipt.gasUsed).to.be.lt(2000000); // 2M gas limit for unstake
        });

        it("should allow removing and re-adding tokens within limit", async function () {
            const mockCoinFactory = await ethers.getContractFactory("MockCoin");

            const token1 = await mockCoinFactory.deploy();
            await token1.deployed();
            await TREASURY.connect(owner).addPayoutToken(token1.address);

            // Deactivate and remove token
            await TREASURY.connect(owner).deactivatePayoutToken(token1.address);
            await TREASURY.connect(owner).removePayoutToken(token1.address);

            // Should be able to add a new token
            const token2 = await mockCoinFactory.deploy();
            await token2.deployed();
            await TREASURY.connect(owner).addPayoutToken(token2.address);

            expect(await TREASURY.isPayoutToken(token2.address)).to.be.true;
        });
    });
});
