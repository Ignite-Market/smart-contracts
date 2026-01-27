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

After the CT are deployed you need to set Oracle via `setOracle`.
After FPMM Factory is deployed you need to verify the FPMM implementation after the first FPMM is deployed (https://eips.ethereum.org/EIPS/eip-1167). Get implementationMaster from FPPM Factory and verify that address.

## Coston2 deployment:

| Contract name                  | Contract address                           |
| ------------------------------ | ------------------------------------------ | ---------------------------------------------- |
| FixedProductMarketMakerFactory | 0xb9042C5E63EbF7819a627F317b1420848d7aA42b | old 0x6bCCF9b918403D10AE8530FEcBeeBabcf57A0479 |
| ConditionalTokens              | 0x11B0f693E37e53DB1aA7f89ab8E360deD3468F30 |
| IgniteOracle                   | 0xc4Dd86578631F16093ceC832766578eE6f2ee2dF | old 0x320C4791A63C6b44f40010F9e54Af80fEe6F25Ce |

## Flare mainnet deployment:

| Contract name                  | Contract address                           |
| ------------------------------ | ------------------------------------------ |
| FixedProductMarketMakerFactory | 0xCcf7B6AC95D7466A70322D2363cc2C97C81fbe0B |
| ConditionalTokens              | 0xC3C077A248e36418eA9CC23A684aBf8677C09B58 |
| IgniteOracle                   | 0xb085A9E2defe1E1c0C33DdF2475376EcC89D0679 |
