const hre = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  const ContractF = await hre.ethers.getContractFactory("IgniteOracle");

  const args = [
    '0x5f2B7077a7e5B4fdD97cBb56D9aD02a4f326896d', // 0x5f2B7077a7e5B4fdD97cBb56D9aD02a4f326896d stg admin - Deployer address
    '0x55613b6ECeb4b6e83C2398c425b62187f0A758a9', // conditionalTokens address
    3, // minVotes
  ]

  const contr = await ContractF.deploy(
    ...args
  );


  await contr.deployed();

  console.log(
    "IgniteOracle deployed to: %saddress/%s",
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

  