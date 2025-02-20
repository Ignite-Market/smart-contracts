
require('hardhat-abi-exporter');
require('hardhat-contract-sizer');
require('solidity-coverage');
require("@nomiclabs/hardhat-waffle");
require('@nomiclabs/hardhat-etherscan');

const { privateKeyTestnet, privateKeyMainnet, coston2RpcApi, baseSepoliaApiKey } = require('./secrets.json');

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.26',
        settings: {
          evmVersion: `london`,
        }
      },
      {
        version: '0.5.1',
      },
    ],
  },
  // sourcify: {
  //   enabled: false,
  // },
  networks: {
    baseSepolia: {
      url: "https://base-sepolia.g.alchemy.com/v2/rGCTaF-9bBmbfeSTu8XivBMqMaqlUgsB",
      chainId: 84532,
      accounts: [privateKeyTestnet], 
      gasPrice: 'auto',
      explorer: "https://sepolia.basescan.org/",
    },
    coston2: {
      url: `https://coston2-api.flare.network/ext/C/rpc?x-apikey=${coston2RpcApi}`,
      chainId: 114,
      accounts: [privateKeyTestnet], 
      gasPrice: 'auto',
      explorer: "https://coston2.testnet.flarescan.com/",
    },
    celestiaTestnet: {
      url: `https://rpc.opcelestia-raspberry.gelato.digital`,
      chainId: 123420111,
      accounts: [privateKeyTestnet], 
      gasPrice: 'auto',
      explorer: "https://opcelestia-raspberry.gelatoscout.com/",
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: baseSepoliaApiKey
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
         apiURL: "https://api-sepolia.basescan.org/api",
         browserURL: "https://sepolia.basescan.org"
        }
      },
    ],
  },
  abiExporter: {
    path: "./data/abi",
    clear: true,
    flat: true,
  },
  // mocha: {
  //   // grep: 'ConditionalTokens',
  //   // grep: 'IgniteOracle',
  // },
};
