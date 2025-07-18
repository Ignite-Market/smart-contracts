const hre = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  const ContractF = await hre.ethers.getContractFactory("IgniteOracle");

  const args = [
    '0x5f2B7077a7e5B4fdD97cBb56D9aD02a4f326896d', // 0x5f2B7077a7e5B4fdD97cBb56D9aD02a4f326896d stg admin - Deployer address
    '0x11B0f693E37e53DB1aA7f89ab8E360deD3468F30', // conditionalTokens address
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

  