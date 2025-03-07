**Audit instructions:**

Main protocol contracts are:

1. ConditionalTokens.sol

    Forked from: https://github.com/gnosis/conditional-tokens-contracts/
    
    Audit already available:
    https://github.com/gnosis/conditional-tokens-contracts/tree/master/docs/audit 

2. FixedProductMarketMakerFactory.sol, FixedProductMarketMaker.sol

    Forked from https://github.com/gnosis/conditional-tokens-market-makers/
    
    Audit already availabe:
    https://github.com/gnosis/conditional-tokens-market-makers/tree/master/docs

3. IgniteOracle.sol

    This contract was written from scratch by us. The purpose of this contract is to collect proof for condition resolution, from different off-chain sources and obtain consensus among them. In case consensus can't be reached, condition goes on voting performed by whitelisted addresses. Once consensus is reached (either by off-chain source or voting), payout is performed on conditional token.

    No audit available.

