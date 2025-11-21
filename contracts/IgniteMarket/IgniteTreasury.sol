// SPDX-License-Identifier: MIT

pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract IgniteTreasury is Ownable, ReentrancyGuard, Pausable {
	using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────────
    // Constants & Types
	uint256 private constant PRECISION = 1e18;    // Precision for decimal calculations - 1e18 precision.
	uint16 public constant BASIS_POINTS = 10_000; // Basis point for percentage calculations - 100%.
	uint8 public constant MAX_PAYOUT_TOKENS = 25; // Maximum number of payout tokens allowed.

    // ─────────────────────────────────────────────────────────────────────────────
    // Events
	/**
	 * @dev Event emitted when a user stakes stake tokens.

	 * @param user Address of the user who staked.
	 * @param amount Amount of stake tokens staked.
	 */
	event Staked(
		address indexed user,
		uint256 amount
	);

	/**
	 * @dev Event emitted when a user unstakes stake tokens.
	 *
	 * @param user Address of the user who unstaked.
	 * @param amount Amount of stake tokens unstaked.
	 */
    event Unstaked(
		address indexed user,
		uint256 amount
	);

	/**
	 * @dev Event emitted when fees are distributed between stakers and owner.
	 *
	 * @param payoutToken Address of the payout token.
	 * @param distributedAmount Amount of fees distributed.
	 * @param stakersAmount Amount of fees distributed to stakers.
	 * @param ownerAmount Amount of fees distributed to the owner.
	 */
	event FeesDistributed(
		address indexed payoutToken,
		uint256 distributedAmount,
		uint256 stakersAmount,
		uint256 ownerAmount
	);

    /**
	 * @dev Event emitted when fees are withdrawn for a given payout token.
	 *
	 * @param user Address of the user who withdrew fees.
	 * @param payoutToken Address of the payout token.
	 * @param amount Amount of fees withdrawn.
	 */
    event FeesWithdrawn(
        address indexed user,
        address indexed payoutToken,
        uint256 amount
    );

	/**
	 * @dev Event emitted when owner fees are withdrawn for a given payout token.
	 *
	 * @param payoutToken Address of the payout token.
	 * @param amount Amount of fees withdrawn.
	 * @param to Address to withdraw fees to.
	 */
	event OwnerFeesWithdrawn(
	    address indexed payoutToken,
		uint256 amount,
		address to
	);

    // ─────────────────────────────────────────────────────────────────────────────
    // Admin specific variables.
	address public caller; // Authorized caller (e.g., cron/keeper) that may call divideFees(…)

    // ─────────────────────────────────────────────────────────────────────────────
    // Staking specific variables.
	IERC20 public immutable stakeToken;            // Address of the stake token - ING token.
	uint256 public totalStaked;                    // Total staked balance.
	mapping(address => uint256) public staked;     // Staked balance of each user.
	uint16 public stakersShareDistribution = 7000; // Stakers share distribution ratio (e.g., 7000 = 70% for stakers, 30% for the owner)
	
    // ─────────────────────────────────────────────────────────────────────────────
    // Payout tokens specific variables.
    struct PayoutTokenState {
        uint256 stakersRewardPerShare; // Cumulative rewards per share (1e18 precision).
        uint256 trackedBalance;        // Accounting balance of this ERC20 allocated to this contract (not yet withdrawn).
        uint256 ownerReward;           // Amount accrued to the owner for this token (awaiting withdrawal).
        bool isActive;                 // Whether the payout token is active.
    }
	address[] public payoutTokens;                                // Addresses of the payout tokens.
	mapping(address => bool) public isPayoutToken;                // Whether a token is a payout token.
	mapping(address => PayoutTokenState) public payoutTokenState; // State of each payout token.


    // ─────────────────────────────────────────────────────────────────────────────
    // User rewards specific variables.
    mapping(address => mapping(address => uint256)) public userBaselineRewardDebt; // Marks where the user "started" in the cumulative reward system.  When calculating rewards, we subtract this to get only rewards earned AFTER joining.
    mapping(address => mapping(address => uint256)) public userClaimableRewards;   // Rewards that have been calculated and locked in, ready to withdraw. When a user's stake changes (stake more or unstake), we update their pending rewards and lock them in.


	/**
	 * @dev Constructor.
	 *
	 * @param _owner Address of the initial owner.
	 * @param _caller Address of the caller.
	 * @param _stakeToken Address of the stake token - ING token.
     * @notice ******************************************** IMPORTANT ******************************************************
     * @notice **                                                                                                         **
     * @notice ** The stake token must be an standard compliant ERC20 token (no fees on transfers, no balance rebasing).  **
     * @notice **                                                                                                         **   
     * @notice *************************************************************************************************************
	 */
    constructor(
		address _owner,
		address _caller,
		address _stakeToken
	) Ownable(_owner) {
        require(_owner != address(0), "NA not allowed");

        require(_caller != address(0), "NA not allowed");
        caller = _caller;

        require(_stakeToken != address(0), "NA not allowed");
		stakeToken = IERC20(_stakeToken);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Modifiers.
	/**
	 * @dev Modifier to only allow the caller or the owner to call the function.
	 */
    modifier onlyCallerOrOwner() {
        require(msg.sender == caller || msg.sender == owner(), "Not authorized");
        _;
    }
  
    // ─────────────────────────────────────────────────────────────────────────────
    // Admin functions.
    /**
     * @dev Pause the treasury.
     */
	function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the treasury.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

	/**
	 * @dev Set the caller.
	 *
	 * @param _caller New caller address.
	 */
	function setCaller(address _caller) external onlyOwner {
		require(_caller != address(0), "NA not allowed");
		caller = _caller;
	}

	/**
	 * @dev Set the stakers share distribution.
	 *
	 * @param distribution New stakers share distribution.
	 */
	function setStakersShareDistribution(uint16 distribution) external onlyOwner {
		require(distribution <= BASIS_POINTS, "Distribution must be less than or equal to 100%");
		stakersShareDistribution = distribution;
	}

	/**
	 * @dev Add a new payout token to the treasury.
	 * @param payoutToken The address of the payout token to add.
     * @notice ******************************************** IMPORTANT ******************************************************
     * @notice **                                                                                                         **
     * @notice ** The payout token must be an standard compliant ERC20 token (no fees on transfers, no balance rebasing). **
     * @notice **                                                                                                         **   
     * @notice *************************************************************************************************************
	 */
	function addPayoutToken(address payoutToken) external onlyOwner {
		require(payoutToken != address(0), "NA not allowed");
        require(payoutToken != address(stakeToken), "Stake token cannot be added as a payout token");
    	require(!isPayoutToken[payoutToken], "Payout token already exists");
    	require(payoutTokens.length < MAX_PAYOUT_TOKENS, "Maximum payout tokens reached");


    	isPayoutToken[payoutToken] = true;
    	payoutTokens.push(payoutToken);
    	payoutTokenState[payoutToken].isActive = true;
  	}

    /**
	 * @dev Deactivate a payout token.
	 *
	 * @param payoutToken The address of the payout token to deactivate.
	 */
    function deactivatePayoutToken(address payoutToken) external onlyOwner {
        require(isPayoutToken[payoutToken], "Payout token does not exist");

        // Distribute any pending fees before deactivation.
        divideFees(payoutToken);

        // Mark token as inactive to prevent new rewards from accumulating.
        PayoutTokenState storage state = payoutTokenState[payoutToken];
        if (state.isActive) {
            state.isActive = false;
        }
    }

    /**
	 * @dev Activate a payout token.
	 *
	 * @param payoutToken The address of the payout token to activate.
	 */
    function activatePayoutToken(address payoutToken) external onlyOwner {
        require(isPayoutToken[payoutToken], "Payout token does not exist");
        
        PayoutTokenState storage state = payoutTokenState[payoutToken];
        require(!state.isActive, "already active");
        state.isActive = true;
    }

    /**
	 * @dev Remove a payout token from the treasury.
	 *
	 * @param payoutToken The address of the payout token to remove.
	 */
    function removePayoutToken(address payoutToken) external onlyOwner {
        require(isPayoutToken[payoutToken], "Payout token does not exist");
        PayoutTokenState storage state = payoutTokenState[payoutToken];

        // Payout token must be inactive and fully and balances fully drained.
        require(!state.isActive, "Payout token must be inactive");
        require(state.trackedBalance == 0, "Tracked balance must be 0");
        require(state.ownerReward == 0, "Owner reward must be 0");
        require(IERC20(payoutToken).balanceOf(address(this)) == 0, "Untracked balance present");

        isPayoutToken[payoutToken] = false;
        uint256 len = payoutTokens.length;
        for (uint256 i; i < len; ++i) {
            if (payoutTokens[i] == payoutToken) {
                payoutTokens[i] = payoutTokens[len - 1];
                payoutTokens.pop();
                break;
            }
        }
        delete payoutTokenState[payoutToken];
    }

    /**
	 * @dev Sweep inactive payout token to the owner.
	 *
	 * @param payoutToken The address of the payout token to sweep.
	 * @param to The address to sweep the payout token to.
	 */
    function sweepInactive(address payoutToken, address to) external onlyOwner {
        require(to != address(0), "NA not allowed");
        require(isPayoutToken[payoutToken], "Payout token does not exist");
        require(payoutToken != address(stakeToken), "Cannot sweep stake token");

        PayoutTokenState storage state = payoutTokenState[payoutToken];
        require(!state.isActive, "Payout token must be inactive");
        require(state.trackedBalance == 0 && state.ownerReward == 0, "Payout token must be fully drained");

        uint256 balance = IERC20(payoutToken).balanceOf(address(this));
        IERC20(payoutToken).safeTransfer(to, balance);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Staking functions.
	/**
	 * @dev Stake stake tokens into the treasury.
	 *
	 * @param amount Amount of stake tokens to stake.
	 */
	function stake(uint256 amount) external nonReentrant whenNotPaused {
		require(amount > 0, "amount must be non-zero");

		// Update the user's claimable rewards before stake size changes.
		_updateAllClaimableRewards(msg.sender);

		staked[msg.sender] += amount;
        totalStaked += amount;

        // Update user baseline reward debts to reflect the new stake size.
        _syncUserBaselineRewardDebt(msg.sender);

		// Transfer stake tokens to the treasury.
		stakeToken.safeTransferFrom(msg.sender, address(this), amount);
		emit Staked(msg.sender, amount);
	}

	/**
	 * @dev Unstake stake tokens from the treasury.
	 *
	 * @param amount Amount of stake tokens to unstake.
	 */
	function unstake(uint256 amount) external nonReentrant whenNotPaused {
		require(amount > 0, "amount must be non-zero");
		require(staked[msg.sender] >= amount, "insufficient staked balance");

        // Lock in claimable rewards at current RPS.
		_updateAllClaimableRewards(msg.sender);

		staked[msg.sender] -= amount;
		totalStaked -= amount;

         // Update user baseline reward debts to reflect the new stake size.
        _syncUserBaselineRewardDebt(msg.sender);

		// Transfer stake tokens to the user.
		stakeToken.safeTransfer(msg.sender, amount);
		emit Unstaked(msg.sender, amount);
	}

	/**
	 * @dev Distribute non distributed fees for a given payout token between stakers and owner.
	 *
	 * @param payoutToken The address of the payout token to distribute fees for.
	 */
	function divideFees(address payoutToken) public onlyCallerOrOwner {
		require(isPayoutToken[payoutToken], "Payout token does not exist");
		
		// Get the current payout token state.
		PayoutTokenState storage state = payoutTokenState[payoutToken];
        if (!state.isActive) return; // Inactive token => no new distributions.


		// Check if there are new tokens to distribute.
		uint256 payoutTokenBalance = IERC20(payoutToken).balanceOf(address(this));
		if (payoutTokenBalance <= state.trackedBalance) {
			return; // No new tokens to distribute.
		}
		uint256 newlyReceived = payoutTokenBalance - state.trackedBalance;

		
		// Calculate the amount to distribute to the stakers & owner.
		uint256 toStakers;
		uint256 toOwner;
        if (totalStaked == 0) {
            // If there are no stakers, credit everything to the owner.
            toOwner = newlyReceived;
            state.ownerReward += toOwner;
            state.trackedBalance += toOwner;
        } else {
            // Calculate the amount to distribute to the stakers and give remainder to the owner (including rounding dust).
            toStakers = (newlyReceived * stakersShareDistribution) / BASIS_POINTS;
            toOwner = newlyReceived - toStakers;

            uint256 rpsInc = (toStakers * PRECISION) / totalStaked;
            uint256 distributedToStakers = (rpsInc * totalStaked) / PRECISION;
            uint256 roundingDust = toStakers - distributedToStakers;

			// Increase the global reward per share.
            state.stakersRewardPerShare += rpsInc;
            state.ownerReward += toOwner + roundingDust;

            // Only the realizable amounts increase tracked balance.
            state.trackedBalance += distributedToStakers + toOwner;
        }

		
		emit FeesDistributed(payoutToken, newlyReceived, toStakers, toOwner);
	}

    /**
	 * @dev Distribute fees for multiple payout tokens at once.
	 *
	 * @param payoutTokens_ Array of payout tokens to distribute fees for.
	 */
    function divideFeesBatch(address[] calldata payoutTokens_) external onlyCallerOrOwner {
        uint256 len = payoutTokens_.length;

        for (uint256 i = 0; i < len; ++i) {
            divideFees(payoutTokens_[i]);
        }
    }

    /**
	 * @dev Withdraw fees for a given payout token.
	 *
	 * @param payoutToken Address of the payout token to withdraw fees for.
	 */
    function withdrawFees(address payoutToken) external nonReentrant whenNotPaused {
        require(isPayoutToken[payoutToken], "Payout token does not exist");

        // Update the user's claimable rewards: Pending -> Claimable.
        _updateClaimableRewards(msg.sender, payoutToken);

        uint256 amount = userClaimableRewards[msg.sender][payoutToken];
        require(amount > 0, "No fees to withdraw");

        // Reset the user's claimable rewards.
        userClaimableRewards[msg.sender][payoutToken] = 0;

        // Decrease the accounting balance and transfer the fees.
        PayoutTokenState storage state = payoutTokenState[payoutToken];
        state.trackedBalance -= amount;

        // Transfer the fees.
        IERC20(payoutToken).safeTransfer(msg.sender, amount);
        emit FeesWithdrawn(msg.sender, payoutToken, amount);
    }

	/**
	 * @dev Withdraw owner fees for a given payout token.
	 *
	 * @param payoutToken Address of the payout token to withdraw fees for.
	 * @param to Address to withdraw fees to.
	 * @param amount Amount of fees to withdraw.
	 */
	function withdrawOwnerFees(address payoutToken, address to, uint256 amount) external onlyOwner nonReentrant {
		require(isPayoutToken[payoutToken], "Payout token does not exist");
        require(to != address(0), "NA not allowed");

		PayoutTokenState storage state = payoutTokenState[payoutToken];
		require(amount > 0 && amount <= state.ownerReward, "Amount must be greater than 0 and less than or equal to the owner reward");

		// Decrease the owner reward and tracked balance.
		state.ownerReward -= amount;
		state.trackedBalance -= amount;

		// Transfer the fees.
		IERC20(payoutToken).safeTransfer(to, amount);
		emit OwnerFeesWithdrawn(payoutToken, amount, to);
	}

    // ─────────────────────────────────────────────────────────────────────────────
    // View functions.
    /**
	 * @dev View current expected rewards (pending + claimable) for a user and token.
	 *
	 * @param user Address of the user to view the pending rewards for.
	 * @param payoutToken Address of the payout token to view the pending rewards for.
	 * @return The pending rewards for the user and payout token.
	 */
    function pendingRewards(address user, address payoutToken) external view returns (uint256) {
        require(isPayoutToken[payoutToken], "Payout token does not exist");

        PayoutTokenState storage state = payoutTokenState[payoutToken];
        uint256 rps = state.stakersRewardPerShare;

        // If new fees are already on the contract (but divideFees hasn't been called yet), include them in the view.
        if (state.isActive && totalStaked > 0) {
            uint256 feesBalance = IERC20(payoutToken).balanceOf(address(this));
            if (feesBalance > state.trackedBalance) {
                uint256 newlyReceived = feesBalance - state.trackedBalance;
                uint256 toStakers = (newlyReceived * stakersShareDistribution) / BASIS_POINTS;
                rps += (toStakers * PRECISION) / totalStaked;
            }
        }

        return userClaimableRewards[user][payoutToken] + ((staked[user] * rps) / PRECISION) - userBaselineRewardDebt[user][payoutToken];
    }

    /**
	 * @dev View the user's total staking share.
	 *
	 * @param user Address of the user to view the staking share for.
	 * @return The user's staking share.
	 */
    function getUserStakingShare(address user) external view returns (uint256) {
        if (totalStaked == 0) return 0;
        return (staked[user] * BASIS_POINTS) / totalStaked;
    }

    /**
	 * @dev View the undistributed fees for a payout token.
	 *
	 * @param payoutToken Address of the payout token to view the undistributed fees for.
	 * @return The undistributed fees for the payout token.
	 */
    function getUndistributedFees(address payoutToken) external view returns (uint256) {
        require(isPayoutToken[payoutToken], "Payout token does not exist");

        PayoutTokenState memory state = payoutTokenState[payoutToken];
        uint256 balance = IERC20(payoutToken).balanceOf(address(this));
        if (balance <= state.trackedBalance) return 0;

        return balance - state.trackedBalance;
    }

	// ─────────────────────────────────────────────────────────────────────────────
	// Internal bookkeeping functions.
	/**
	 * @dev Updates the user's claimable rewards for a specific payout token.
	 * Calculates pending rewards earned since the last update,
	 * moves them to the claimable bucket, and updates the baseline debt.
	 * 
	 * @param user Address of the user whose rewards to update.
	 * @param payoutToken Address of the payout token to update rewards for.
	 */
    function _updateClaimableRewards(address user, address payoutToken) internal {
		if (!isPayoutToken[payoutToken]) return;

        PayoutTokenState storage state = payoutTokenState[payoutToken];
        uint256 rps = state.stakersRewardPerShare;

        // Calculate pending rewards earned since the user's last update.
        uint256 pending = ((staked[user] * rps) / PRECISION) - userBaselineRewardDebt[user][payoutToken];
        if (pending > 0) {
            userClaimableRewards[user][payoutToken] += pending;
        }
        
        // Update the baseline debt to the current state. This marks the new "starting point" for future reward calculations.
        userBaselineRewardDebt[user][payoutToken] = (staked[user] * rps) / PRECISION;
    }

    /**
	 * @dev Syncs the user's baseline reward debt for all payout tokens.
	 *
	 * @param user Address of the user to sync the baseline reward debt for.
	 */
    function _syncUserBaselineRewardDebt(address user) internal {
        uint256 len = payoutTokens.length;

        for (uint256 i = 0; i < len; ++i) {
            address token = payoutTokens[i];
            if (!isPayoutToken[token]) continue;

            userBaselineRewardDebt[user][token] = (staked[user] * payoutTokenState[token].stakersRewardPerShare) / PRECISION;
        }
    }

    /**
	 * @dev Updates the user's claimable rewards for all payout tokens.
	 *
	 * @param user Address of the user to update the claimable rewards for.
	 */
    function _updateAllClaimableRewards(address user) internal {
        uint256 len = payoutTokens.length;

        for (uint256 i = 0; i < len; ++i) {
            address token = payoutTokens[i];
            _updateClaimableRewards(user, token);
        }
    }
}