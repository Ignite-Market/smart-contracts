const hre = require('hardhat');

async function main() {
  const [signer] = await ethers.getSigners();

  const ContractF = await hre.ethers.getContractFactory('ConditionalTokens');

  const args = [
    // '0x6bCCF9b918403D10AE8530FEcBeeBabcf57A0479' // FPMM factory address
    '0xCcf7B6AC95D7466A70322D2363cc2C97C81fbe0B', // FPMM factory mainnet
  ];

  const contr = await ContractF.deploy(...args);

  await contr.deployed();

  console.log(
    'ConditionalTokens deployed to: %saddress/%s',
    hre.network.config.explorer || '',
    contr.address
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
