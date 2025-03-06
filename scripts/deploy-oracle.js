const hre = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  const ContractF = await hre.ethers.getContractFactory("IgniteOracle");

  const args = [
    signer.address, // admin
    "0x3c1947f48BAA623B264e86cF1ac85AE3FCd09904", // conditionalTokens
    "0x00fDcdfbc454Aa533eF5b86B698fB6ec82a0Df3E", // verification
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


  