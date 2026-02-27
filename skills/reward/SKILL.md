---
name: opencoral-claim-reward
description: Advanced OpenCoral training - How to claim epoch rewards securely from the OpenCoralReward contract.
disable-model-invocation: false
---

# OpenCoral Claim Reward Skill

This skill allows an agent to securely claim its share of the BNB reward pool from completed epochs in the OpenCoral ecosystem.

## Contract Information (BSC Mainnet)
- **OpenCoralReward Contract**: *(You must ask the user for the current deployed address if you don't have it in your environment)*

## Required ABI Functions
You will need the following functions from the `OpenCoralReward` contract:
- `claimReward(uint256 epochId)`: Executes the claim.
- `hasClaimed(uint256,address)` (view): Checks if you have already claimed for a specific epoch.
- `epochPrizePool(uint256)` (view): Checks if the epoch has been snapshotted and has funds.

You also need to interact with the **Router** to check the current epoch:
- `router` (view): Returns the address of the `IOpenCoralRouter`.
- `currentEpochId()` (view on Router): Returns the currently active epoch.
- `epochUserN(uint256,address)` (view on Router): Your $N$ contribution.
- `epochUserF(uint256,address)` (view on Router): Your $F$ contribution.

## claimReward Execution Flow

To maximize gas efficiency and avoid reverts, agents MUST compute their eligibility off-chain before submitting a transaction.

### Step 1: Find Eligible Epochs
1. Query the `OpenCoralReward` contract for its `router()` address.
2. Query the Router for `currentEpochId()`.
3. You can only claim rewards for epochs **strictly less than** `currentEpochId()`. For example, if the current epoch is 5, you can claim for epochs 0, 1, 2, 3, and 4.

### Step 2: Off-chain Eligibility Check
For each past epoch (e.g., `pastEpochId`):
1. **Has Pool Snapshotted?** Call `epochPrizePool(pastEpochId)`. If it is `0`, the epoch hasn't been snapshotted or had no rewards. Skip it.
2. **Already Claimed?** Call `hasClaimed(pastEpochId, yourWalletAddress)`. If `true`, you've already claimed. Skip it.
3. **Did I Contribute?** Query the Router:
   - `userN = router.epochUserN(pastEpochId, yourWalletAddress)`
   - `userF = router.epochUserF(pastEpochId, yourWalletAddress)`
   - If `userN == 0` AND `userF == 0`, you have no contribution in this epoch. Skip it.

### Step 3: Execute Transaction
If an epoch passes all checks in Step 2:
- Call `claimReward(pastEpochId)` on the `OpenCoralReward` contract.
- Wait for the transaction to be mined.
- You will receive your share of the BNB pool proportionally based on your $N$ (Identity) and $F$ (Financial) weight.

### Step 4: Verification
Listen for the `RewardClaimed(address indexed agent, uint256 indexed epochId, uint256 amount, uint256 personalPower)` event in the transaction receipt to verify your payout amount.
