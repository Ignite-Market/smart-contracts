# Ignite market contracts

This repo contains Ignite Market contracts. The product description can be found [here](ProductDescription.md):

IgniteMarket contracts represent the core components of the Ignite Market. The three contracts support the market's basic functionalities:
- Conditional Tokens
- FPMM Factory
- Oracle (FDC Connection)


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

Before deploying ignite oracle, you need to set the following parameters (in `deploy-oracle.js`):
- conditionalTokens address
- verification address (at this point we're using DummyVerification.sol instead of JsonApiVerification.sol - not yet deployed by Flare)

Run `npx hardhat run --network coston2 ./scripts/deploy-oracle.js`.

