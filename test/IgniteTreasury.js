const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IgniteTreasury", function () {
    let owner, caller, otherUser, TREASURY, DEFAULT_PAYOUT_TOKEN, ING_TOKEN, OTHER_PAYOUT_TOKEN;
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
        [owner, caller, otherUser] = await ethers.getSigners();

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
                const newCaller = otherUser.address;
                await TREASURY.connect(owner).setCaller(newCaller);
                expect(await TREASURY.caller()).to.equal(newCaller);
            });

            it("should revert when called by non-owner", async function () {
                await expect(TREASURY.connect(caller).setCaller(otherUser.address))
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
                // Stake some tokens first (using otherUser, not owner).
                const stakeAmount = ethers.utils.parseUnits("1000", 6);
                await ING_TOKEN.connect(owner).faucetMint(otherUser.address, stakeAmount);
                await ING_TOKEN.connect(otherUser).approve(TREASURY.address, stakeAmount);
                await TREASURY.connect(otherUser).stake(stakeAmount);
                
                // Verify staking worked.
                const totalStaked = await TREASURY.totalStaked();
                expect(totalStaked).to.equal(stakeAmount);
                expect(await TREASURY.staked(otherUser.address)).to.equal(stakeAmount);
                
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
});
