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
        uint256 outcomeSlotCount; // >= 2
        uint256 apiSources; // >= 3
        uint256 consensusPercent; // 51 - 100
        uint256 resolutionTime; // > block.timestamp
    }

    mapping(bytes32 => Question) public question;

    mapping(bytes32 => bytes32) public jqToQuestionId;

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

    function initializeQuestion(
        bytes32 questionId,
        uint256 outcomeSlotCount,
        string[] memory urlAr,
        string[] memory postprocessJqAr,
        uint256 consensusPercent,
        uint256 resolutionTime
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {

        require(question[questionId].outcomeSlotCount == 0, "Question already initialized");
        require(outcomeSlotCount >= 2, "outcomeSlotCount < 2");

        require(urlAr.length == postprocessJqAr.length, "Array mismatch");
        require(urlAr.length >= 3, "Oracle requires at least 3 API sources");
        require(
            consensusPercent >= 51 && consensusPercent <= 100, 
            "consensusPercent has to be in range 51-100"
        );

        require(resolutionTime > block.timestamp, "Only future events");

        question[questionId] = Question({
            status: Status.ACTIVE,
            outcomeSlotCount: outcomeSlotCount,
            apiSources: urlAr.length,
            consensusPercent: consensusPercent,
            resolutionTime: resolutionTime
        });

        // Prepare condition on conditionalTokens
        conditionalTokens.prepareCondition(address(this), questionId, outcomeSlotCount);

        // Map each jqKey to questionId -- we will need this for resolution
        bytes32 jqKey;
        for (uint256 i = 0; i < urlAr.length; i++) {
            jqKey = keccak256(
                abi.encodePacked(urlAr[i], postprocessJqAr[i])
            );

            require(jqToQuestionId[jqKey] == bytes32(0), "jqKey duplicate"); 
            jqToQuestionId[jqKey] = questionId;
        }
    }

    function finalizeQuestion(
        bytes32 questionId, 
        IJsonApi.Proof[] calldata proofs
    ) external {
        Question storage qData = question[questionId];

        require(qData.status == Status.ACTIVE, "Cannot finalize, status != ACTIVE");
        require(qData.resolutionTime <= block.timestamp, "Resolution time not reached");

        // Allow finalize only if all api proofs are given
        require(proofs.length == qData.apiSources, "Proofs & apiSources mismatch");

        // Process each API result proof
        bytes32 jqKey;
        uint256[] memory payouts = new uint256[](qData.outcomeSlotCount);

        for (uint256 i = 0; i < proofs.length; i++) {
            IJsonApi.Proof memory proof = proofs[i];

            // check if proof matches with questionId
            jqKey = keccak256(
                abi.encodePacked(proof.data.requestBody.url, proof.data.requestBody.postprocessJq)
            );
            require(jqToQuestionId[jqKey] == questionId, "Proof for invalid questionId");

            // check if proof actually is valid
            require(
                verification.verifyJsonApi(proof),
                "JsonApi is not confirmed by DA Layer"
            );

            // decode result
            uint256 outcomeIdx = abi.decode(proof.data.responseBody.abi_encoded_data, (uint256));

            payouts[outcomeIdx] += 1;
        }

        // Find winner id
        uint256 winnerId = type(uint256).max;
        for (uint256 i = 0; i < payouts.length; i++) {
            if (payouts[i] * 100 / qData.apiSources >= qData.consensusPercent) {
                winnerId = i;
                break;
            }
        }

        if (winnerId == type(uint256).max) {
            // require voting
            qData.status = Status.VOTING;

        } else {
            qData.status = Status.FINALIZED;

            // clear all non winning ids
            for (uint256 i = 0; i < payouts.length; i++) {
                if (winnerId == i) {
                    continue;
                }
                payouts[i] = 0;
            }

            conditionalTokens.reportPayouts(questionId, payouts);
        }
    }

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
            uint256[] memory payouts = new uint256[](qData.outcomeSlotCount);
            payouts[outcomeIdx] = 1;

            conditionalTokens.reportPayouts(questionId, payouts);

            qData.status = Status.FINALIZED;
        }
    }

    /**
     * Override grant & revoke role, to keep track of total number of voters
     */

    function grantRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        if(role == VOTER_ROLE && !hasRole(VOTER_ROLE, account)) {
            noOfVoters += 1;
        }
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        if(role == VOTER_ROLE && hasRole(VOTER_ROLE, account)) {
            noOfVoters -= 1;
        }
        _revokeRole(role, account);
    }

}