# Summary

Ignite Market is a decentralized prediction market platform, designed to enable users to trade on the outcomes of real-world events. The initial implementation leverages the FPMM (Fixed Product Market Maker) and conditional tokens, ensuring a robust and transparent trading mechanism.

To power its resolution process, Ignite Market integrates Flare FDC (Flare Data Connector), ensuring accurate and trustless event resolution. Additionally, Flare Oracles provide reliable and decentralized token price data, supporting the trading experience.

By utilizing these Flare-specific components, Ignite Market not only delivers a functional prediction market but also serves as a live demonstration of Flare's blockchain capabilities, highlighting its potential for decentralized finance (DeFi) applications.


---

# Prediction Market Sets and Basic Logic

A prediction market set defines the fundamental characteristics of each prediction market on Ignite Market. It acts as a framework that structures how predictions are created, managed, and resolved. Each prediction set includes the following components:

- **Unique Identifier:** A distinct code that uniquely identifies each prediction set within the platform.  
- **Outcome Names:** Possible outcomes for the prediction, typically framed as distinct, mutually exclusive options (e.g., "Yes" or "No").  
- **Question:** The central query or event being predicted, clearly framed to avoid ambiguity.  
- **Description:** A detailed explanation of the event or context behind the prediction, ensuring users understand its background and significance.  
- **General Resolution Description:** A high-level summary of how the prediction will be resolved, offering clarity on the expected evaluation process.  
- **Outcome Resolution Definition:** Specific criteria and data sources that determine the official resolution of the prediction, ensuring transparency and accuracy.  
- **Outcome Price Definition:** A description of how outcome prices are calculated, including references to external price feeds or oracles like the Flare Price Oracle.  
- **Start Date/Time:** The official launch date and time when the prediction market opens for trading.  
- **End Date/Time:** The final date and time when trading closes, after which no further market activity is allowed.  
- **Resolution Date/Time:** The scheduled time when the market's outcome is finalized, based on pre-defined resolution criteria.

---

# Prediction Set Outcome

A prediction set can have multiple outcomes, representing the possible results of the predicted event. Each outcome is assigned a percentage of the total share price based on market dynamics.

### Initial Share Price Allocation

When a prediction market is created, the share price for each outcome is evenly distributed if no prior probabilities are specified.

**For example:**
- **2 Outcomes:** Each outcome starts with a 50% share price allocation.  
- **3 Outcomes:** Each outcome starts with 33.33%.  
- **4 Outcomes:** Each outcome starts with 25%.  

### Dynamic Price Adjustments

The price will dynamically change and is reflected by the full percentage of all shares.  

- As users trade shares, the share prices of outcomes adjust based on market demand using the FPMM (Fixed Product Market Maker) model.  
- Higher demand for an outcome increases its share price, while reducing the share prices of competing outcomes, maintaining a total sum of 100%.


# FPMM: Fixed Product Market Maker
The FPMM originates from Gnosis FPMM and introduces the basic trading mechanism for trading outcome shares within conditional tokens.

The FPMM (Fixed Product Market Maker) is an automated market maker using a mechanism similar to Uniswap and Balancer pools. However, the FPMM logic is specifically tailored for prediction markets.

## FPMM Invariant Formula

In FPMM, we always track unchanged matematical product which presents constant. We use the following formula:
constant = product("Total Number Of Tokens" for each OutcomeShare)


#### An Example with FPMM

Let’s add initnal liquidity to the market "Maversicks vs Hawks" - MvH with $10. The $10 tokens are converted into 10 **M** tokens and 10 **H** tokens, and are added to the pool. 

Now let’s say Joe buys 10USDC worth of **M** tokens from MvH:

1. Joe Sends 10USDC to MvH pool.
2. MvH converts the 10usdc into 10 **M** and 10 **H** outcome tokens. MvH pool now has 20 **M** and 20 **H** tokens, breaking its invariant (expected constant: 100, current constant: 400).
3. MvH returns 15 **M** tokens to Joe, restoring the constant.

### Post-Trade State

At the end of this trade:  
- MvH pool has **5 M** tokens and **20 H** tokens remaining in its inventory.  
- MvH pool estimates the odds as:  
  - **M:** 80%  
  - **H:** 20%


# Prediction Set Liquidity

## Prediction Sets in Ignite Market
Prediction sets in Ignite Market start without liquidity. Initial liquidity is provided by a centralized authority using funds from the Treasury Pool, which is replenished through trading and pool fees.

### Liquidity Mechanics

#### Initial Liquidity Provision
- Central authority injects liquidity from the Treasury Pool.
- Liquidity added from the central authority sets the initial distribution.
- The Treasury Pool is funded by trade and pool fees.

#### User-Added Liquidity
- Users can contribute liquidity.
- Users will be able to receive back yield as a part of their initial contribution.

### Incentives and Limitations for Liquidity

#### Minimum Market Liquidity Threshold - TR A
- A prediction market will not open until a sufficient liquidity threshold is met.
- Users can reclaim the funds they contributed to liquidity if the threshold is not achieved.
- This threshold is defined individually for each market set, though generally all market sets will have the same threshold.
- Liquidity providers will receive a portion of the transaction fees generated within the market set. These fees can be claimed after the market is resolved.
- All users contributing to liquidity will share a proportional stake in the rewards, up to the specified threshold.


# Resolution Set Definition

Before any prediction set can be created on the marketplace, the resolution mechanism must be defined. This mechanism is governed by pre-defined rules and consensus within the smart contract. The following factors define these rules:

### Predefined Resolution Outcomes
- Each outcome is clearly defined and must be mapped to an API or voting mechanism outcome.

### Consensus Within the Smart Contract
- The rule specifies the number of APIs (or votes) involved (n) and the number required to agree on the outcome (k).
- A time limit is set for reaching consensus, after which the outcome is automatically resolved based on the API data.

### Resolution Types
- **Automatic Resolution**: If consensus is not reached within the time limit, a voting mechanism is triggered.
- **Voting Mechanism**: A whitelisted voting system is used to finalize the resolution.

### JSONJQ Verifier Server and Attestation
- The JSONJQ Verifier Server is used for verification and attestation, ensuring that resolution is accurate and secure.
- JSONJQ Verifier Server is available on GitHub.

### Open Participation
- Anyone can participate in providing Flare resolution data, contributing to the transparency and decentralization of the process.

If there is no market resolution, users can sell back their tokens until the liquidity is empty. This means that all the shares could be sold back to the pool, and the prices vary depending on the current weight.

---

# Market Payment Units

Share prices are consistently calculated in their USD equivalent, providing a standardized reference for all transactions. If users opt to pay for shares with tokens other than USD, such as FLR, the token swap mechianism is used. 

