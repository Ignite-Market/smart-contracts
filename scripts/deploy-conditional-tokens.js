const hre = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  const ContractF = await hre.ethers.getContractFactory("ConditionalTokens");

  const args = [
    '0x9Fd0E27c085FdbEc4F93d0a345E6a795D0615dCc' // FPMM factory address
  ]

  const contr = await ContractF.deploy(
    ...args
  );

  await contr.deployed();

  console.log(
    "ConditionalTokens deployed to: %saddress/%s",
    hre.network.config.explorer || "",
    contr.address
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


  