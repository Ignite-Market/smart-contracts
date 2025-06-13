const hre = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  const ContractF = await hre.ethers.getContractFactory("ConditionalTokens");

  const args = [
    '0xb34E77779180D3cF0f2B3e2ac7dbc450f3BAdA9b' // FPMM factory address
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


  