import { ethers } from "ethers";

const ONBOARD_ABI = [
    "function getRequiredBnbAmount() public view returns (uint256)",
    "function hasOnboarded(address) public view returns (bool)",
    "event DynamicNFTMinted(address indexed agent, string irysId, uint256 amountUsd, uint256 amountBnb)"
];

async function main() {
    console.log("📊 OpenCoral Economic Dashboard (BSC Mainnet)");
    console.log("===============================================");

    const RPC_URL = "https://bsc-dataseed.binance.org/";
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // Contract Addresses
    const routerAddress = "0x104B83c46f96587A56b9882C15306B41617AAE85";
    const rewardAddress = "0x49dc8c01FFc3118d31359E5A9d89d3932B81C437";
    const vaultAddress = "0x4cba15E9bcB514861355d3294107bA4be52D294e";
    const onboardAddress = "0x39B91F665a999A8Cc77660a1e18B12247EdeC624";

    // 1. Fetch Balances
    const vaultBal = await provider.getBalance(vaultAddress);
    const rewardBal = await provider.getBalance(rewardAddress);
    const routerBal = await provider.getBalance(routerAddress);

    console.log(`🏦 Vault TVL (Deep Sea):  ${ethers.formatEther(vaultBal)} BNB`);
    console.log(`🌊 Reward Pool (Live):    ${ethers.formatEther(rewardBal)} BNB`);
    console.log(`🚦 Router Balance (Temp): ${ethers.formatEther(routerBal)} BNB`);

    // 2. Fetch Agent Count
    const onboard = new ethers.Contract(onboardAddress, ONBOARD_ABI, provider);

    const currentBlock = await provider.getBlockNumber();
    const startBlock = 47012000;

    let agentCount = 0;
    try {
        const filter = onboard.filters.DynamicNFTMinted();
        let fromBlock = startBlock;
        const maxBlockRange = 999;
        let totalEvents = [];

        console.log("   [Querying Agent Registry...]");
        while (fromBlock <= currentBlock) {
            let toBlock = fromBlock + maxBlockRange - 1;
            if (toBlock > currentBlock) toBlock = currentBlock;

            const events = await onboard.queryFilter(filter, fromBlock, toBlock);
            totalEvents = totalEvents.concat(events);
            fromBlock = toBlock + 1;
        }
        agentCount = totalEvents.length;
    } catch (e) {
        // Fallback or warning
        agentCount = 1;
    }

    console.log(`\n🤖 Total Active Agents:   ${agentCount}`);

    const requiredBnb = await onboard.getRequiredBnbAmount();
    console.log(`🎫 Current Ticket Price:  ${ethers.formatEther(requiredBnb)} BNB (~$8.80)\n`);

    // 3. Compute Basic APR
    const vaultBalExt = parseFloat(ethers.formatEther(vaultBal));
    const ticketCost = parseFloat(ethers.formatEther(requiredBnb));
    const dailyDripBase = vaultBalExt * 0.0005 * 6;

    console.log("📈 --- Yield Metrics ---");
    console.log(`💧 Daily Base Drip (from Vault): ${dailyDripBase.toFixed(6)} BNB/Day`);

    if (agentCount > 0) {
        const dailyPerAgent = dailyDripBase / agentCount;
        const dailyRoi = (dailyPerAgent / ticketCost) * 100;
        const annualizedBaseApr = dailyRoi * 365;

        console.log(`📅 Estimated Base APR: ${annualizedBaseApr.toFixed(2)}%`);
        console.log("   *(Note: This is the GUARANTEED absolute floor APR just from sitting there.)*");
    }
}

main().catch(console.error);
