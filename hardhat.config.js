require('hardhat-abi-exporter');
require('hardhat-contract-sizer');
require('solidity-coverage');
require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-etherscan');

const {
  privateKeyTestnet,
  privateKeyMainnet,
  coston2RpcApi,
  baseSepoliaApiKey,
} = require('./secrets.json');

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
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
  },
  // sourcify: {
  //   enabled: false,
  // },
  networks: {
    baseSepolia: {
      url: 'https://base-sepolia.g.alchemy.com/v2/rGCTaF-9bBmbfeSTu8XivBMqMaqlUgsB',
      chainId: 84532,
      accounts: [privateKeyTestnet],
      gasPrice: 'auto',
      explorer: 'https://sepolia.basescan.org/',
    },
    coston2: {
      url: `https://coston2-api.flare.network/ext/C/rpc?x-apikey=${coston2RpcApi}`,
      chainId: 114,
      accounts: [privateKeyTestnet],
      gasPrice: 'auto',
      explorer: 'https://coston2.testnet.flarescan.com/',
    },
    celestiaTestnet: {
      url: `https://rpc.opcelestia-raspberry.gelato.digital`,
      chainId: 123420111,
      accounts: [privateKeyTestnet],
      gasPrice: 'auto',
      explorer: 'https://opcelestia-raspberry.gelatoscout.com/',
    },
    flareTestnetCoston2: {
      url: 'https://coston2-api.flare.network/ext/C/rpc',
    },
    flare: {
      url: `https://flare-api.flare.network/ext/C/rpc?x-apikey=${coston2RpcApi}`,
      chainId: 14,
      accounts: [privateKeyMainnet],
      gasPrice: 'auto',
      explorer: 'https://mainnet.flarescan.com/',
    },
    hardhat: {
      forking: {
        url: `https://coston2-api.flare.network/ext/C/rpc?x-apikey=${coston2RpcApi}`,
        jsonRpcUrl: `https://coston2-api.flare.network/ext/C/rpc?x-apikey=${coston2RpcApi}`,
      },
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: baseSepoliaApiKey,
      coston2: 'coston2', // apiKey is not required, just set a placeholder
      flareTestnetCoston2: 'empty',
      flare: 'empty',
    },
    customChains: [
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org',
        },
      },
      {
        network: 'coston2',
        chainId: 114,
        urls: {
          apiURL:
            'https://api.routescan.io/v2/network/testnet/evm/114/etherscan',
          browserURL: 'https://coston2.testnet.flarescan.com',
        },
      },
      {
        network: 'flareTestnetCoston2',
        chainId: 114,
        urls: {
          apiURL: 'https://coston2-explorer.flare.network/api',
          browserURL: 'https://coston2-explorer.flare.network',
        },
      },
      {
        network: 'flare',
        chainId: 14,
        urls: {
          apiURL:
            // 'https://api.routescan.io/v2/network/mainnet/evm/14/etherscan',
            'https://flare-explorer.flare.network/api',
          browserURL: 'https://flare-explorer.flare.network',
          //'https://mainnet.flarescan.com',
        },
      },
    ],
  },
  abiExporter: {
    path: './data/abi',
    clear: true,
    flat: true,
  },
  // mocha: {
  //   // grep: 'ConditionalTokens',
  //   // grep: 'IgniteOracle',
  // },
};
