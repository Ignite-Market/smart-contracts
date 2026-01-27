const hre = require('hardhat');

async function main() {
  const [signer] = await ethers.getSigners();

  const ContractF = await hre.ethers.getContractFactory('IgniteOracle');

  const args = [
    '0x5f2B7077a7e5B4fdD97cBb56D9aD02a4f326896d', // stg admin - Deployer address
    // '0x58de7938e5D1f7c0c1395B4eCE456059CAB7DE3f', // mainnet signer
    '0x11B0f693E37e53DB1aA7f89ab8E360deD3468F30', // conditionalTokens address
    // '0xC3C077A248e36418eA9CC23A684aBf8677C09B58', // conditionalTokens mainnet
    3, // minVotes
    2, // minApiSources
  ];

  const contr = await ContractF.deploy(...args);

  await contr.deployed();

  console.log(
    'IgniteOracle deployed to: %saddress/%s',
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
