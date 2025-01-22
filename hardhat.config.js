
require('hardhat-abi-exporter');
require('hardhat-contract-sizer');
require('solidity-coverage');
require("@nomiclabs/hardhat-waffle");
require('@nomiclabs/hardhat-etherscan');

const { amoyScanApiKey, privateKeyTestnet, privateKeyMainnet, polygonScanApiKey, baseSepoliaApiKey } = require('./secrets.json');

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
  sourcify: {
    enabled: false,
  },
  networks: {
    polygon: {
      url: 'https://polygon-mainnet.g.alchemy.com/v2/T-mROIoeYqiBLxxBRhVb1BgW26oYH-Dk',
      chainId: 137,
      gasPrice: 'auto', // 40gwei
      accounts: [privateKeyMainnet],
      explorer: 'https://polygonscan.com/',
    },
    polygonAmoy: {
      url: 'https://polygon-amoy.g.alchemy.com/v2/RH5hNyFZbVhB-97gPHGGSW3VSPzFARER',
      accounts: [privateKeyTestnet],
      chainId: 80002,
      gasPrice: 'auto', // 10gwei
      gas: 2000000,
      explorer: "https://www.oklink.com/amoy/"
    },
    baseSepolia: {
      url: "https://base-sepolia.g.alchemy.com/v2/rGCTaF-9bBmbfeSTu8XivBMqMaqlUgsB",
      chainId: 84532,
      accounts: [privateKeyTestnet], 
      gasPrice: 'auto',
      explorer: "https://sepolia.basescan.org/",
    },
  },
  etherscan: {
    apiKey: {
      polygon: polygonScanApiKey,
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
};
