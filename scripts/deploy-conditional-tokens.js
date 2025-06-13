const hre = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  const ContractF = await hre.ethers.getContractFactory("ConditionalTokens");

  const args = [
    '0x520ba2749A4091D540F617EDc8A279411E286f4B' // FPMM factory address
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


  