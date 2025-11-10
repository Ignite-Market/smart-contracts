const hre = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  const ContractF = await hre.ethers.getContractFactory("IgniteTreasury");

  const args = [
    '0x5f2B7077a7e5B4fdD97cBb56D9aD02a4f326896d', // owner - Deployer address (Should be multisig)
    '0x5f2B7077a7e5B4fdD97cBb56D9aD02a4f326896d', // caller - Authorized caller address (can be same as owner)
    '0x0000000000000000000000000000000000000000', // stakeToken - Ignite token - ING address
  ]

  const contr = await ContractF.deploy(
    ...args
  );


  await contr.deployed();

  console.log(
    "IgniteTreasury deployed to: %saddress/%s",
    hre.network.config.explorer,
    contr.address
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

