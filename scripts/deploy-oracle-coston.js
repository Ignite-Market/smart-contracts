const hre = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  const ContractF = await hre.ethers.getContractFactory("IgniteOracleCoston");

  const args = [
    '0x5f2B7077a7e5B4fdD97cBb56D9aD02a4f326896d', // 0x5f2B7077a7e5B4fdD97cBb56D9aD02a4f326896d stg admin
    "0x34997462F89b10F5a5d9b38c13Ce38f6853e370c", // conditionalTokens
    3, // minVotes
  ]

  const contr = await ContractF.deploy(
    ...args
  );


  await contr.deployed();

  console.log(
    "IgniteOracleCoston deployed to: %saddress/%s",
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


  