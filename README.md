# Ignite market contracts

This repo contains Ignite Market contracts. The product description can be found [here](ProductDescription.md):

IgniteMarket contracts represent the core components of the Ignite Market. The three contracts support the market's basic functionalities:

- Conditional Tokens
- FPMM Factory
- Oracle (FDC Connection)

#### Gnosis Prediction Market Smart Contracts

Conditional tokens and FPMM are Gnosis-based smart contracts created for prediction markets. The solution adds minor changes and updates to tests for these contracts. These contracts were also already audited. Regardless, additional audit will be done.

Original source code is available here:

- https://github.com/gnosis/conditional-tokens-market-makers/
- https://github.com/gnosis/conditional-tokens-contracts

## Development

> Instructions for development.

### Project setup

Copy `secrets.sample.json` to `secrets.json` and fill out missing data.

### Test

Run `npm test`.

### Build

Run `npm run build`.

### Flatten

Run `npm run flatten`.

### Verify contract

> Note: Verify contract on coston2 scan using website verify feature & flatened contract from this repo

## Deployment

> Smart contract deployment instructions.

Run `npx hardhat run --network coston2 ./scripts/deploy-conditional-tokens.js`.

Run `npx hardhat run --network coston2 ./scripts/deploy-fpmm-factory.js`.

Before deploying ignite oracle, you need to set the following parameters (in `deploy-oracle-*.js`):

- conditionalTokens address

### Coston testnet deployment:

Run `npx hardhat run --network coston2 ./scripts/deploy-oracle-coston.js`.

Verify contract `npx hardhat verify --network coston2 CONTRACT_ADDRESS ARG1 ARG2 ....`
