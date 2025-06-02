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

> Note: Verify contract on coston2 scan using website verify feature & flattened contract from this repo

Verify on FlareScan:

```
npx hardhat verify --network coston2 contractAddress arguments
```

Verify on flare network:

```
npx hardhat verify --network flareTestnetCoston2 contractAddress arguments
```

## Deployment

> Smart contract deployment instructions.

Run `npx hardhat run --network coston2 ./scripts/deploy-fpmm-factory.js`.

Before deploying conditional tokens, you need to set the following parameters (in `deploy-conditional-tokens.js`):

- FPMM factory address

Run `npx hardhat run --network coston2 ./scripts/deploy-conditional-tokens.js`.

Before deploying ignite oracle, you need to set the following parameters (in `deploy-oracle.js`):

- deployer address
- conditional tokens address
- minimum number of voters

Run `npx hardhat run --network coston2 ./scripts/deploy-oracle.js`.

Verify contract `npx hardhat verify --network coston2 CONTRACT_ADDRESS ARG1 ARG2 ....`


## Coston2 deployment:
FixedProductMarketMakerFactory: 0x520ba2749A4091D540F617EDc8A279411E286f4B
ConditionalTokens: 0x1f75110bF2C2494542cc26469BEe169bC4e6fA4f
IgniteOracle: 0xe97598CdFFd75efC698b7483a88612cf2570E72c
