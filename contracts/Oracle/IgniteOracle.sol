// SPDX-License-Identifier: MIT

pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IJsonApi} from "./interfaces/IJsonApi.sol";
import {IJsonApiVerification} from "./interfaces/IJsonApiVerification.sol";

interface IConditionalTokens {
    function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external;
    function reportPayouts(bytes32 questionId, uint[] calldata payouts) external;
}

contract IgniteOracle is AccessControl {

    /**
    * @dev Emitted when a resolution vote is cast. 
    * @param voter Voter's address.
    * @param questionId Question ID. 
    * @param outcomeIdx Outcome index ID.
    */
    event VoteSubmitted(
        address indexed voter,
        bytes32 indexed questionId, 
        uint256 outcomeIdx
    );

    bytes32 public constant VOTER_ROLE = keccak256("VOTER_ROLE");

    IConditionalTokens public immutable conditionalTokens;
    IJsonApiVerification public immutable verification;

    enum Status {
        INVALID,
        ACTIVE,
        VOTING,
        FINALIZED
    }

    struct Question {
        Status status;
        bool automatic; // If question resolution is automatic through API sources.
        uint256 outcomeSlotCount; // >= 2
        uint256 apiSources; // >= 3
        uint256 consensusPercent; // 51 - 100
        uint256 endTime; // > block.timestamp
        uint256 resolutionTime; // > block.timestamp
        uint256[] apiResolution;
        uint256 winnerIdx; // by default type(uint256).max
    }

    mapping(bytes32 => Question) public question;

    mapping(bytes32 => bytes32) public jqToQuestionId;
    mapping(bytes32 => bool) public jqProcessed;

    uint256 public noOfVoters;
    mapping(bytes32 => mapping(address => bool)) public hasVoted; // question => voter => true/false
    mapping(bytes32 => mapping(uint256 => uint256)) public questionOutcomeVotes; // question => outcome => uint256

    uint256 public minVotes; // minimal required votes in case of voting

    constructor(
        address _admin,
        address _conditionalTokens,
        address _verification,
        uint256 _minVotes
    ) {
        require(_conditionalTokens != address(0), "NA not allowed");
        conditionalTokens = IConditionalTokens(_conditionalTokens);

        require(_verification != address(0), "NA not allowed");
        verification = IJsonApiVerification(_verification);

        require(_minVotes >= 3, "Min votes < 3");
        minVotes = _minVotes;

        require(_admin != address(0), "NA not allowed");
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /**
     * @dev Initializes question.
     * @param questionId Question ID.
     * @param outcomeSlotCount Number of question outcomes.
     * @param urlAr Array of API sources URLs.
     * @param postprocessJqAr Array of Postprocess JQs.
     * @param consensusPercent Consensus percent.
     * @param resolutionTime Resolution time.
     * @param automatic Tells if question resolution is automatic via API sources.
     */
    function initializeQuestion(
        bytes32 questionId,
        uint256 outcomeSlotCount,
        string[] memory urlAr,
        string[] memory postprocessJqAr,
        uint256 consensusPercent,
        uint256 endTime,
        uint256 resolutionTime,
        bool automatic
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {

        require(question[questionId].status == Status.INVALID, "Question already initialized");
        require(outcomeSlotCount >= 2, "outcomeSlotCount < 2");
        require(
            consensusPercent >= 51 && consensusPercent <= 100,
            "consensusPercent has to be in range 51-100"
        );
        require(endTime > block.timestamp, "endTime has to be in the future.");
        require(
            resolutionTime > endTime, 
            "Resolution time has to be later than endTime."
        );

        // If resolution is automatic require API sources.
        if (automatic) {
            require(urlAr.length == postprocessJqAr.length, "Array mismatch");
            require(urlAr.length >= 3, "Oracle requires at least 3 API sources");
        }

        question[questionId] = Question({
            status: Status.ACTIVE,
            automatic: automatic,
            outcomeSlotCount: outcomeSlotCount,
            apiSources: urlAr.length,
            consensusPercent: consensusPercent,
            endTime: endTime,
            resolutionTime: resolutionTime,
            apiResolution: new uint256[](outcomeSlotCount),
            winnerIdx: type(uint256).max
            
        });

        // Prepare condition on Conditional Tokens contract.
        conditionalTokens.prepareCondition(address(this), questionId, outcomeSlotCount);

        // Map each jqKey to questionId -- we will need this for automatic resolution.
         if (automatic) {
            bytes32 jqKey;

            for (uint256 i = 0; i < urlAr.length; i++) {
                jqKey = keccak256(
                    abi.encodePacked(questionId, urlAr[i], postprocessJqAr[i])
                );

                require(jqToQuestionId[jqKey] == bytes32(0), "jqKey duplicate"); 
                jqToQuestionId[jqKey] = questionId;
            }
        }
    }

    /**
     * @dev Finalizes question.
     * @param questionId Question ID.
     * @param proofs Proofs array.
     * @param finalize finalize should be false only if we hit a gas limit.
     */
    function finalizeQuestion(
        bytes32 questionId, 
        IJsonApi.Proof[] calldata proofs,
        bool finalize
    ) external {
        Question storage qData = question[questionId];

        require(qData.status == Status.ACTIVE, "Cannot finalize, status != ACTIVE");
        require(qData.endTime <= block.timestamp, "End time not reached");

        // If resolution is not automatic go straight to voting phase.
        if (!qData.automatic) {
            qData.status = Status.VOTING;
            return;
        }

        // Process each API result proof.
        bytes32 jqKey;

        for (uint256 i = 0; i < proofs.length; i++) {
            IJsonApi.Proof memory proof = proofs[i];

            // Check if proof matches with questionId.
            jqKey = keccak256(
                abi.encodePacked(questionId, proof.data.requestBody.url, proof.data.requestBody.postprocessJq)
            );
            require(jqToQuestionId[jqKey] == questionId, "Proof for invalid questionId");

            // Check for proof duplicates.
            require(!jqProcessed[jqKey], "Duplicate proof");
            jqProcessed[jqKey] = true;

            // Check if proof actually is valid.
            require(
                verification.verifyJsonApi(proof),
                "Invalid proof (provided)"
            );

            // Decode result.
            uint256 outcomeIdx = abi.decode(proof.data.responseBody.abi_encoded_data, (uint256));

            qData.apiResolution[outcomeIdx] += 1;
        }

        if (finalize) {
            // Find winner ID.
            uint256 winnerId = type(uint256).max;
            uint256 jqProcessedCount;
            for (uint256 i = 0; i < qData.outcomeSlotCount; i++) {
                jqProcessedCount += qData.apiResolution[i];
                if (qData.apiResolution[i] * 100 / qData.apiSources >= qData.consensusPercent) {
                    winnerId = i;
                }
            }

            if (winnerId == type(uint256).max) {

                /** 
                  * Require voting - only if:
                  * 1. all api jqs were processed OR
                  * 2. resolutionTime has passed (fail-safe)
                  */
                if (
                    jqProcessedCount >= qData.apiSources ||
                    qData.resolutionTime <= block.timestamp
                ) {
                    qData.status = Status.VOTING;
                }

            } else {
                _finalizeAndReportPayout(questionId, winnerId);
            }
        }
    }

    /**
     * @dev Casts a vote for a question.
     * @param questionId Question ID.
     * @param outcomeIdx Outcome index ID.  
     */
    function vote(
        bytes32 questionId, 
        uint256 outcomeIdx
    ) external onlyRole(VOTER_ROLE) {
        Question storage qData = question[questionId];

        require(qData.status == Status.VOTING, "Cannot vote, status != VOTING");

        require(!hasVoted[questionId][msg.sender], "Already voted");
        hasVoted[questionId][msg.sender] = true;

        require(outcomeIdx < qData.outcomeSlotCount, "Invalid outcomeIdx");
        questionOutcomeVotes[questionId][outcomeIdx] += 1;

        if (
            questionOutcomeVotes[questionId][outcomeIdx] >= minVotes && 
            questionOutcomeVotes[questionId][outcomeIdx] * 100 / noOfVoters >= qData.consensusPercent
        ) {
            _finalizeAndReportPayout(questionId, outcomeIdx);
        }

        emit VoteSubmitted(msg.sender, questionId, outcomeIdx);
    }

    function _finalizeAndReportPayout(
        bytes32 questionId,
        uint256 winnerId
    ) private {
        Question storage qData = question[questionId];

        qData.status = Status.FINALIZED;
        qData.winnerIdx = winnerId;

        uint256[] memory payouts = new uint256[](qData.outcomeSlotCount);
        payouts[winnerId] = 1;

        conditionalTokens.reportPayouts(questionId, payouts);
    }

    /**
     * Override grant role, to keep track of total number of voters
     * 
     * @dev Grants a role to an account.
     * @param role Role.
     * @param account Account.
     */
    function grantRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        if(role == VOTER_ROLE && !hasRole(VOTER_ROLE, account)) {
            noOfVoters += 1;
        }
        _grantRole(role, account);
    }

    /**
     * Override revoke role, to keep track of total number of voters
     * 
     * @dev Revokes a role from an account.
     * @param role Role.
     * @param account Account.
     */
    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        if(role == VOTER_ROLE && hasRole(VOTER_ROLE, account)) {
            noOfVoters -= 1;
        }
        _revokeRole(role, account);
    }

    /**
     * Override renounce role, to keep track of total number of voters
     * 
     * @dev Renounces a role from an account.
     * @param role Role.
     * @param callerConfirmation callerConfirmation.
     */
    function renounceRole(bytes32 role, address callerConfirmation) public override {
        if (callerConfirmation != _msgSender()) {
            revert AccessControlBadConfirmation();
        }

        if(role == VOTER_ROLE && hasRole(VOTER_ROLE, callerConfirmation)) {
            noOfVoters -= 1;
        }

        _revokeRole(role, callerConfirmation);
    }
}