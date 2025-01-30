const { expect } = require("chai");
const { ethers } = require("hardhat");
const { before } = require("node:test");

describe("IgniteOracle", function () {
  let owner, ORACLE, CONDITIONAL_TOKENS, VERIFICATION, voter1, voter2, voter3, VOTER_ROLE;

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

  it("Initialize, finalize question", async function () {
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

    await ORACLE.finalizeQuestion(
        questionId,
        proofs
    );

    const qData = await ORACLE.question(questionId);
    expect(qData.status).to.equal(STATUS_FINALIZED);
  });

  it("Initialize, finalize (without consensus), then vote", async function () {
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

  describe("Resolution voting", async () => {
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
            expect(qData.automatic).to.equal(true);
            expect(qData.outcomeSlotCount).to.equal(outcomeSlots);
            expect(qData.apiSources).to.equal(urlAr.length);
            expect(qData.resolutionTime).to.equal(resolutionTime);
        });
    });
  });


});

function createProofList(results) {
    const proofs = [];

    for (res of results) {
        proofs.push({
            merkleProof: [],
            data: {
                attestationType: ethers.utils.formatBytes32String("JsonApi"),
                sourceId: ethers.utils.formatBytes32String("Source_01"),
                votingRound: 0,
                lowestUsedTimestamp: 0,
                requestBody: {
                    url: res.url,
                    postprocessJq: "",
                    abi_signature: ""
                },
                responseBody: { 
                    abi_encoded_data: ethers.utils.defaultAbiCoder.encode(
                        [ "uint256" ], 
                        [ res.result ]
                    )
                }
            }
        });
    }

    return proofs;
}
