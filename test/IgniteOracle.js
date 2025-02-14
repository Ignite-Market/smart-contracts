const { expect } = require("chai");
const { ethers } = require("hardhat");
const { createProofList } = require('./helpers/utils');
const { toUtf8CodePoints } = require("ethers/lib/utils");

describe("IgniteOracle", function () {
    let owner, ORACLE, CONDITIONAL_TOKENS, VERIFICATION, voter1, voter2, voter3, VOTER_ROLE, noRoleVoter;

    let curDate = Math.ceil(new Date().getTime() / 1000);

    STATUS_INVALID = 0;
    STATUS_ACTIVE = 1;
    STATUS_VOTING = 2;
    STATUS_FINALIZED = 3;

    before(async () => {
        await hre.network.provider.send("hardhat_reset");
    });

    beforeEach(async () => {
        [owner, voter1, voter2, voter3, noRoleVoter] = await ethers.getSigners();

        const conditionalTokensF = await ethers.getContractFactory("contracts/ConditionalTokens/ConditionalTokens.sol:ConditionalTokens");
        CONDITIONAL_TOKENS = await conditionalTokensF.deploy();
        await CONDITIONAL_TOKENS.deployed();

        const verificationF = await ethers.getContractFactory("DummyVerification");
        VERIFICATION = await verificationF.deploy();
        await VERIFICATION.deployed();

        const oracleF = await ethers.getContractFactory("IgniteOracle");
        ORACLE = await oracleF.deploy(
            owner.address, // admin
            CONDITIONAL_TOKENS.address, // conditionalTokens
            VERIFICATION.address, // verification
            3, // minVotes
        );
        await ORACLE.deployed();

        VOTER_ROLE = await ORACLE.VOTER_ROLE();

        await ORACLE.grantRole(VOTER_ROLE, voter1.address);
        await ORACLE.grantRole(VOTER_ROLE, voter2.address);
        await ORACLE.grantRole(VOTER_ROLE, voter3.address);
    });

    describe('Oracle flows', async () => {
        it("flow: initialize automatic question -> finalize question", async function () {
            const questionId = ethers.utils.formatBytes32String("question_01");
            const outcomeSlotCount = 2;

            const urlAr = [
                "http://www.nba.com/api",
                "http://www.bet365.com/api",
                "http://www.random.com/api",
            ];

            const postprocessJqAr = [
                "",
                "",
                "",
            ]

            const consensusPercent = 59;
            const resolutionTime = curDate + 100; // 100 sec in future
            const automaticResolution = true;

            await ORACLE.initializeQuestion(
                questionId,
                outcomeSlotCount,
                urlAr,
                postprocessJqAr,
                consensusPercent,
                resolutionTime,
                automaticResolution
            );

            await ethers.provider.send("evm_increaseTime", [100]);
            curDate += 100;

            // Finalize question
            const proofs = createProofList(
                [
                    {url: urlAr[0], result: 1},
                    {url: urlAr[1], result: 1},
                    {url: urlAr[2], result: 0},
                ]
            )

            const tx = await ORACLE.finalizeQuestion(
                questionId,
                proofs
            );

            const receipt = await tx.wait();

            const qData = await ORACLE.question(questionId);
            expect(qData.status).to.equal(STATUS_FINALIZED);
        });

        it("flow: Initialize automatic question -> finalize (without consensus) -> then vote", async function () {
            const questionId = ethers.utils.formatBytes32String("question_01");
            const outcomeSlotCount = 2;

            const urlAr = [
                "http://www.nba.com/api",
                "http://www.bet365.com/api",
                "http://www.random.com/api",
            ];

            const postprocessJqAr = [
                "",
                "",
                "",
            ]

            const consensusPercent = 90;
            const resolutionTime = curDate + 100; // 100 sec in future
            const automaticResolution = true;

            await ORACLE.initializeQuestion(
                questionId,
                outcomeSlotCount,
                urlAr,
                postprocessJqAr,
                consensusPercent,
                resolutionTime,
                automaticResolution
            );

            await ethers.provider.send("evm_increaseTime", [100]);
            curDate += 100;

            // Finalize question
            const proofs = createProofList(
                [
                    {url: urlAr[0], result: 1},
                    {url: urlAr[1], result: 1},
                    {url: urlAr[2], result: 0},
                ]
            )

            await ORACLE.finalizeQuestion(
                questionId,
                proofs
            );

            let qData = await ORACLE.question(questionId);
            expect(qData.status).to.equal(STATUS_VOTING);

            await expect(ORACLE.vote(questionId, 0)).to.be.revertedWith(
                `AccessControl: account ${owner.address.toLowerCase()} is missing role ${VOTER_ROLE}`
            );

            // voter 1
            await ORACLE.connect(voter1).vote(questionId, 0);
            expect((await ORACLE.question(questionId)).status).to.equal(STATUS_VOTING);

            // voter 2
            await ORACLE.connect(voter2).vote(questionId, 0);
            expect((await ORACLE.question(questionId)).status).to.equal(STATUS_VOTING);

            // voter 3
            await ORACLE.connect(voter3).vote(questionId, 0);
            expect((await ORACLE.question(questionId)).status).to.equal(STATUS_FINALIZED);

        });

        it("flow: Initialize manual question -> finalize -> then vote", async function () {
            const questionId = ethers.utils.formatBytes32String("question_01");
            const outcomeSlotCount = 2;

            const consensusPercent = 60;
            const resolutionTime = curDate + 100; // 100 sec in future
            const automaticResolution = false;

            await ORACLE.initializeQuestion(
                questionId,
                outcomeSlotCount,
                [],
                [],
                consensusPercent,
                resolutionTime,
                automaticResolution
            );

            await ethers.provider.send("evm_increaseTime", [100]);
            curDate += 100;


            await ORACLE.finalizeQuestion(
                questionId,
                []
            );

            let qData = await ORACLE.question(questionId);
            expect(qData.status).to.equal(STATUS_VOTING);

            await expect(ORACLE.vote(questionId, 0)).to.be.revertedWith(
                `AccessControl: account ${owner.address.toLowerCase()} is missing role ${VOTER_ROLE}`
            );

            // voter 1
            await ORACLE.connect(voter1).vote(questionId, 0);
            expect((await ORACLE.question(questionId)).status).to.equal(STATUS_VOTING);

            // voter 2
            await ORACLE.connect(voter2).vote(questionId, 0);
            expect((await ORACLE.question(questionId)).status).to.equal(STATUS_VOTING);

            // voter 3
            await ORACLE.connect(voter3).vote(questionId, 0);
            expect((await ORACLE.question(questionId)).status).to.equal(STATUS_FINALIZED);
        });
    });

    describe('Question initialization', async () => {
        beforeEach(async ()=> {
            await ethers.provider.send("evm_increaseTime", [1]);
            await ethers.provider.send("evm_mine");
            
            const latestBlock = await ethers.provider.getBlock('latest');
            curDate = latestBlock.timestamp;
        });

        const questionId = ethers.utils.formatBytes32String("question_01");

        it('should not initialize question with duplicate question ID', async () => {
            await ORACLE.initializeQuestion(
                questionId,
                2,
                [],
                [],
                90,
                curDate + 100,
                false
            );

            await expect(
                ORACLE.initializeQuestion(
                    questionId,
                    2,
                    [],
                    [],
                    90,
                    curDate + 100,
                    false
                )
            ).to.be.revertedWith('Question already initialized');
        });

        it('should not initialize question with invalid number if outcome slots (outcomeSlotCount < 2)', async () => {
            const outcomeSlotCount = 1;

            await expect(
                ORACLE.initializeQuestion(
                    questionId,
                    outcomeSlotCount,
                    [],
                    [],
                    90,
                    curDate + 100,
                    false
                )
            ).to.be.revertedWith('outcomeSlotCount < 2');
        });
            
        it('should not initialize question with invalid consensus percent (range 51-100)', async () => {
            const consensusTooLow = 50;
            const consensusTooHigh = 101;

            await expect(
                ORACLE.initializeQuestion(
                    questionId,
                    2,
                    [],
                    [],
                    consensusTooLow,
                    curDate + 100,
                    false
                )
            ).to.be.revertedWith('consensusPercent has to be in range 51-100');

            await expect(
                ORACLE.initializeQuestion(
                    questionId,
                    2,
                    [],
                    [],
                    consensusTooHigh,
                    curDate + 100,
                    false
                )
            ).to.be.revertedWith('consensusPercent has to be in range 51-100');
        });

        it('should not initialize question with invalid resolution time - must be in the future', async () => {
            const currentResolutionTime = curDate;
            const pastResolutionTime = currentResolutionTime - 100;

            await expect(
                ORACLE.initializeQuestion(
                    questionId,
                    2,
                    [],
                    [],
                    90,
                    currentResolutionTime,
                    false
                )
            ).to.be.revertedWith('Only future events');

            await expect(
                ORACLE.initializeQuestion(
                    questionId,
                    2,
                    [],
                    [],
                    90,
                    pastResolutionTime,
                    false
                )
            ).to.be.revertedWith('Only future events');
        });

        it ('should successfully initialize question with manual resolution', async () => {
            const outcomeSlots = 2;
            const consensus = 90;
            const resolutionTime = curDate + 100;
            
            const tx = await ORACLE.initializeQuestion(
                questionId,
                outcomeSlots,
                [],
                [],
                consensus,
                resolutionTime,
                false
            );

            expect(tx).not.to.equal(null);
            expect(tx.hash).not.to.equal(null);

            const receipt = await tx.wait();
            expect(receipt).not.to.equal(null);
            expect(receipt.transactionHash).not.to.equal(null);

            const qData = await ORACLE.question(questionId);
            expect(qData.status).to.equal(STATUS_ACTIVE);
            expect(qData.automatic).to.equal(false);
            expect(qData.outcomeSlotCount).to.equal(outcomeSlots);
            expect(qData.apiSources).to.equal(0);
            expect(qData.resolutionTime).to.equal(resolutionTime);
        });

        context('with automatic resolution', async () => {
            it('should not initialize question if API sources arrays do not match', async () => {
                const urlAr = [
                    "http://www.nba.com/api",
                    "http://www.bet365.com/api",
                    "http://www.random.com/api",
                ];
            
                const postprocessJqAr = [
                    "",
                    "",
                ]
        
                await expect(
                    ORACLE.initializeQuestion(
                        questionId,
                        2,
                        urlAr,
                        postprocessJqAr,
                        90,
                        curDate + 100,
                        true
                    )
                ).to.be.revertedWith('Array mismatch');
            });

            it('should not initialize question if API sources array is of invalid length (at least 3 API sources)', async () => {
                const urlAr = [
                    "http://www.nba.com/api",
                    "http://www.bet365.com/api",
                ];
            
                const postprocessJqAr = [
                    "",
                    "",
                ]
        
                await expect(
                    ORACLE.initializeQuestion(
                        questionId,
                        2,
                        urlAr,
                        postprocessJqAr,
                        90,
                        curDate + 100,
                        true
                    )
                ).to.be.revertedWith('Oracle requires at least 3 API sources');
            });

            it('should not initialize question if API sources are duplicated', async () => {
                const urlAr = [
                    "http://www.nba.com/api",
                    "http://www.nba.com/api",
                    "http://www.nba.com/api",
                ];
            
                const postprocessJqAr = [
                    "",
                    "",
                    "",
                ]
        
                await expect(
                    ORACLE.initializeQuestion(
                        questionId,
                        2,
                        urlAr,
                        postprocessJqAr,
                        90,
                        curDate + 100,
                        true
                    )
                ).to.be.revertedWith('jqKey duplicate');
            });

            it('should successfully initialize question with automatic resolution', async () => {
                const outcomeSlots = 2;
                const consensus = 90;
                const resolutionTime = curDate + 100;

                const urlAr = [
                    "http://www.nba.com/api",
                    "http://www.bet365.com/api",
                    "http://www.random.com/api",
                ];
            
                const postprocessJqAr = [
                    "",
                    "",
                    "",
                ]
                
                const tx = await ORACLE.initializeQuestion(
                    questionId,
                    outcomeSlots,
                    urlAr,
                    postprocessJqAr,
                    consensus,
                    resolutionTime,
                    true
                );
        
                expect(tx).not.to.equal(null);
                expect(tx.hash).not.to.equal(null);
        
                const receipt = await tx.wait();
                expect(receipt).not.to.equal(null);
                expect(receipt.transactionHash).not.to.equal(null);
        
                const qData = await ORACLE.question(questionId);
                expect(qData.status).to.equal(STATUS_ACTIVE);
                expect(qData.automatic).to.equal(true);
                expect(qData.outcomeSlotCount).to.equal(outcomeSlots);
                expect(qData.apiSources).to.equal(urlAr.length);
                expect(qData.resolutionTime).to.equal(resolutionTime);
            });
        });
    });

    describe('Question finalization', async () => {
        const questionId = ethers.utils.formatBytes32String("question_01");
        const outcomeSlotCount = 2;

        beforeEach(async ()=> {
            await ethers.provider.send("evm_increaseTime", [1]);
            await ethers.provider.send("evm_mine");
            
            const latestBlock = await ethers.provider.getBlock('latest');
            curDate = latestBlock.timestamp;
        });

        it('should not finalize question if not in correct status', async () => {
            const newQuestionId = ethers.utils.formatBytes32String("question_02");

            await expect(
                ORACLE.finalizeQuestion(newQuestionId, [])
            ).to.be.revertedWith('Cannot finalize, status != ACTIVE')
        });

        it('should not finalize question if it has been already finalized', async () => {
            await ORACLE.initializeQuestion(
                questionId,
                outcomeSlotCount,
                [],
                [],
                90,
                curDate + 100,
                false
            );

            await ethers.provider.send("evm_increaseTime", [100]);
            curDate += 100;

            await ORACLE.finalizeQuestion(
                questionId,
                []
            );

            await expect(
                ORACLE.finalizeQuestion(questionId, [])
            ).to.be.revertedWith('Cannot finalize, status != ACTIVE')
        });

        it('should not finalize question if its resolution time is not reached', async () => {
            await ORACLE.initializeQuestion(
                questionId,
                outcomeSlotCount,
                [],
                [],
                90,
                curDate + 100,
                false
            );

            await expect(
                ORACLE.finalizeQuestion(questionId, [])
            ).to.be.revertedWith('Resolution time not reached')
        });

        context('with manual resolution', async () => {
            beforeEach(async () => {
                await ORACLE.initializeQuestion(
                    questionId,
                    outcomeSlotCount,
                    [],
                    [],
                    90,
                    curDate + 100,
                    false
                );

                await ethers.provider.send("evm_increaseTime", [100]);
                curDate += 100;
            });

            it('should finalize manual resolution question without proofs and go straight to voting phase', async () => {    
                const tx = await ORACLE.finalizeQuestion(questionId, []);

                expect(tx).not.to.equal(null);
                expect(tx.hash).not.to.equal(null);

                const receipt = await tx.wait();
                expect(receipt).not.to.equal(null);
                expect(receipt.transactionHash).not.to.equal(null);

                const qData = await ORACLE.question(questionId);
                expect(qData.status).to.equal(STATUS_VOTING);
            });
        });

        context('with automatic resolution', async () => {
            const urlAr = [
                "http://www.nba.com/api",
                "http://www.bet365.com/api",
                "http://www.random.com/api",
            ];
    
            const postprocessJqAr = [
                "",
                "",
                "",
            ]

            beforeEach(async () => {
                await ORACLE.initializeQuestion(
                    questionId,
                    outcomeSlotCount,
                    urlAr,
                    postprocessJqAr,
                    60,
                    curDate + 100,
                    true
                );

                await ethers.provider.send("evm_increaseTime", [100]);
                curDate += 100;
            });

            it('should not finalize question without proofs', async () => {
                await expect(
                    ORACLE.finalizeQuestion(questionId, [])
                ).to.be.revertedWith('Proofs & apiSources mismatch');
            });

            it('should not finalize question with invalid proofs', async () => {
                const newQuestionId = ethers.utils.formatBytes32String("question_02");
                const newUrlAr = [
                    "http://www.nba.com/api/new",
                    "http://www.bet365.com/api/new",
                    "http://www.random.com/api/new",
                ];
                const newPostprocessJqAr = [
                    "",
                    "",
                    "",
                ]

                await ORACLE.initializeQuestion(
                    newQuestionId,
                    outcomeSlotCount,
                    newUrlAr,
                    newPostprocessJqAr,
                    60,
                    curDate + 100,
                    true
                );

                const proofs = createProofList(
                    [
                        { url: newUrlAr[0], result: 1 },
                        { url: newUrlAr[1], result: 1 },
                        { url: newUrlAr[2], result: 0 },
                    ]
                );

                await expect(
                    ORACLE.finalizeQuestion(questionId, proofs)
                ).to.be.revertedWith('Proof for invalid questionId');
            });


            it('should not finalize question with duplicated proofs', async () => {
                const proofs = createProofList(
                    [
                        { url: urlAr[0], result: 1 },
                        { url: urlAr[0], result: 1 },
                        { url: urlAr[0], result: 0 },
                    ]
                );

                await expect(
                    ORACLE.finalizeQuestion(questionId, proofs)
                ).to.be.revertedWith('Duplicate proof');
            });

            it('should finalize automatic resolution question with met consensus', async () => {    
                const proofs = createProofList(
                    [
                        { url: urlAr[0], result: 1 },
                        { url: urlAr[1], result: 1 },
                        { url: urlAr[2], result: 0 },
                    ]
                );

                const tx = await ORACLE.finalizeQuestion(questionId, proofs);

                expect(tx).not.to.equal(null);
                expect(tx.hash).not.to.equal(null);

                const receipt = await tx.wait();
                expect(receipt).not.to.equal(null);
                expect(receipt.transactionHash).not.to.equal(null);

                const qData = await ORACLE.question(questionId);
                expect(qData.status).to.equal(STATUS_FINALIZED);
                expect(qData.winnerIdx).to.equal(1);
            });

            it('should finalize automatic resolution question and go to voting phase when consensus is not met', async () => {    
                const newQuestionId = ethers.utils.formatBytes32String("question_02");
                const newUrlAr = [
                    "http://www.nba.com/api/new",
                    "http://www.bet365.com/api/new",
                    "http://www.random.com/api/new",
                ];

                await ORACLE.initializeQuestion(
                    newQuestionId,
                    outcomeSlotCount,
                    newUrlAr,
                    postprocessJqAr,
                    100,
                    curDate + 100,
                    true
                );

                await ethers.provider.send("evm_increaseTime", [100]);
                curDate += 100;
                
                const proofs = createProofList(
                    [
                        { url: newUrlAr[0], result: 1 },
                        { url: newUrlAr[1], result: 1 },
                        { url: newUrlAr[2], result: 0 },
                    ]
                );

                const tx = await ORACLE.finalizeQuestion(newQuestionId, proofs);

                expect(tx).not.to.equal(null);
                expect(tx.hash).not.to.equal(null);

                const receipt = await tx.wait();
                expect(receipt).not.to.equal(null);
                expect(receipt.transactionHash).not.to.equal(null);

                const qData = await ORACLE.question(newQuestionId);
                expect(qData.status).to.equal(STATUS_VOTING);
                expect(qData.winnerIdx).to.equal(ethers.constants.MaxUint256);
            });

        })

    })

    describe("Question resolution voting", async () => {
        const questionId = ethers.utils.formatBytes32String("question_01");
        const outcomeSlotCount = 2;
        const automaticResolution = true;

        const urlAr = [
            "http://www.nba.com/api",
            "http://www.bet365.com/api",
            "http://www.random.com/api",
        ];

        const postprocessJqAr = [
            "",
            "",
            "",
        ]

        beforeEach(async ()=> {
            await ethers.provider.send("evm_increaseTime", [1]);
            await ethers.provider.send("evm_mine");
            
            const latestBlock = await ethers.provider.getBlock('latest');
            curDate = latestBlock.timestamp;

            await ORACLE.initializeQuestion(
                questionId,
                outcomeSlotCount,
                urlAr,
                postprocessJqAr,
                90,
                curDate + 100,
                automaticResolution
            );
        });

        context('without the correct VOTING status', () => {
            it('should not vote if without voter role', async () => {
                await expect(ORACLE.connect(noRoleVoter).vote(questionId, 0)).to.be.revertedWith(
                    `AccessControl: account ${noRoleVoter.address.toLowerCase()} is missing role ${VOTER_ROLE}`
                );
            });

            it('should not vote if not in correct status', async () => {
                await expect(ORACLE.connect(voter1).vote(questionId, 0)).to.be.revertedWith('Cannot vote, status != VOTING')
            });
        });

        context('with the correct VOTING status', async() => {
            beforeEach(async() => {
                const proofs = createProofList(
                    [
                        { url: urlAr[0], result: 1 },
                        { url: urlAr[1], result: 1 },
                        { url: urlAr[2], result: 0 },
                    ]
                )
            
                await ethers.provider.send("evm_increaseTime", [100]);
                curDate += 100;

                await ORACLE.finalizeQuestion(
                    questionId,
                    proofs
                );
            });

            it('should not vote if without voter role', async () => {
                await expect(ORACLE.connect(noRoleVoter).vote(questionId, 0)).to.be.revertedWith(
                    `AccessControl: account ${noRoleVoter.address.toLowerCase()} is missing role ${VOTER_ROLE}`
                );
            });

            it('should not vote if already voted', async () => {
                await ORACLE.connect(voter1).vote(questionId, 0);
                await expect(ORACLE.connect(voter1).vote(questionId, 0)).to.be.revertedWith('Already voted')
            });

            it('should not vote with invalid outcome index', async () => {
                await expect(ORACLE.connect(voter1).vote(questionId, 3)).to.be.revertedWith('Invalid outcomeIdx')
            });

            it('should cast valid vote and emit VoteSubmitted event', async () => {
                const outcomeIndex = 0;

                const tx = await ORACLE.connect(voter1).vote(questionId, outcomeIndex);
                await expect(tx)
                    .to.emit(ORACLE, "VoteSubmitted")
                    .withArgs(
                        voter1.address,
                        questionId,
                        outcomeIndex
                    );
            });
        });
    });
});
