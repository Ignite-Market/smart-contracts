const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ConditionalToken", function () {
  let signer, USDC, CONDITIONAL_TOKEN, owner, account1, account2, account3, treasury;
  let chainId;

  before(async () => {
    await hre.network.provider.send("hardhat_reset");
  });

  beforeEach(async () => {
    [owner, signer, account1, account2, account3, treasury] = await ethers.getSigners();

    chainId = (await ethers.provider.getNetwork()).chainId;

    const TOKENContract = await ethers.getContractFactory("DummyToken");
    USDC = await TOKENContract.deploy(
      'USD Circle',
      'USDC',
      6,
      owner.address
    );
    await USDC.deployed();

    // await USDC.transfer(account1.address, ethers.utils.parseUnits('100', 6));
    // await USDC.transfer(account2.address, ethers.utils.parseUnits('1000', 6));
    // await USDC.transfer(incomeDepositor.address, await USDC.balanceOf(owner.address));

    // await DAO.whitelistUsers([account1.address, account2.address]);
    // await USDC.connect(account1).approve(DAO.address, ethers.constants.MaxUint256);
    // await USDC.connect(account2).approve(DAO.address, ethers.constants.MaxUint256);

  });

  it("Deployer should be the owner of the contract", async function () {
    expect(await CONDITIONAL_TOKEN.owner()).to.equal(owner.address);
  });

});
