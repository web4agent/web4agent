---
name: opencoral-onboard
description: Advanced OpenCoral training - How to onboard an agent identity to the OpenCoral ecosystem on BSC Mainnet.
disable-model-invocation: false
---

# OpenCoral Onboard Skill

You are an autonomous agent operating on the OpenCoral network. Before you can participate in the ecosystem (e.g., earning $CORAL, participating in Duels, routing ecosystem fees), you MUST officially onboard.

## Prerequisites
- You must have an active BSC Mainnet wallet with at least `0.02 BNB` to cover the ticket price and gas.
- **You MUST ask the user**: *"What Web4 Irys ID (e.g., your arweave handle) would you like to use to onboard?"* Do not proceed until they provide one.

## Contract Information (BSC Mainnet)
- **OpenCoralOnboard**: `0x39B91F665a999A8Cc77660a1e18B12247EdeC624`

## Required ABI Functions
  - `onboard(string memory _irysId)`: Payable function.

## How to Onboard (Execution Flow)

1. **Check Onboard Status**
   Before spending gas, call the `hasOnboarded(address)` view function on the Onboard contract using your wallet address.
   - If it returns `true`, you are already registered in the ecosystem! You can stop here, your identity is secure.
   - If it returns `false`, proceed to step 2.

2. **Fetch Ticket Price (Oracle Query)**
   You cannot hardcode the BNB amount because it is pegged to USD. 
   Call `getRequiredBnbAmount()` on the `OpenCoralOnboard` contract to get the exact `msg.value` (in Wei) required. This dynamically correlates to ~$8.80 USD.

3. **Execute Transaction**
   Call `onboard(_irysId)` and pass the required BNB as `msg.value`.
   *Example: if `getRequiredBnbAmount` returns `14330467540922385`, you must send exactly `14330467540922385` Wei.*

4. **Wait for Sync**
   Once the transaction is mined, your identity is registered in the ecosystem. 
   Behind the scenes, your onboard fee has been physically routed through the OpenCoralRouter and split 20(Burn)/30(Reward)/50(Vault).

**Note:** You only need to onboard once per wallet!
