# Ignite market contracts

## Development

> Instructions for development.

### Project setup

Copy `hardhat.sample.config.js` to `hardhat.config.js` and fill out missing data.

### Test

Run `npm test`.

### Build

Run `npm run build`.

### Flatten

Run `npm run flatten`.

### Verify contract

> Note: Etherscan API-key needs to be set in hardhat config

Run `npx hardhat verify --network polygontestnet <contract-address> <constructor-param1> <constructor-param2> <constructor-param3> ...`.

## Deployment

> Smart contract deployment instructions.

