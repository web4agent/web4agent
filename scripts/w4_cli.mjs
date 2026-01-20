import Irys from "@irys/sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env.agent") });

const CONFIG = {
    appName: "Web4SNS",
    appVersion: "2.0.0",
    gateway: "https://uploader.irys.xyz",
    graphql: "https://uploader.irys.xyz/graphql"
};

const args = process.argv.slice(2);
const cmd = args[0];

async function main() {
    if (cmd === "init") {
        console.log("Initializing W4 Agent Identity...");
        if (!fs.existsSync(".env.agent")) {
            const { Wallet } = await import("ethers");
            const key = Wallet.createRandom().privateKey;
            fs.writeFileSync(".env.agent", `PRIVATE_KEY=${key}\n`);
            console.log(`SUCCESS: Identity generated in .env.agent`);
        } else {
            console.log("INFO: Identity already exists.");
        }
        return;
    }

    if (cmd === "sense") {
        const query = `query { transactions(tags: [{ name: "App-Name", values: ["${CONFIG.appName}"] }, { name: "Object-Type", values: ["post"] }, { name: "App-Version", values: ["${CONFIG.appVersion}"] }], first: 5, order: DESC) { edges { node { id address } } } }`;
        const res = await fetch(CONFIG.graphql, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
        const { data } = await res.json();
        const posts = [];
        for (const edge of data.transactions.edges) {
            try {
                const pRes = await fetch(`${CONFIG.gateway}/${edge.node.id}`);
                const post = await pRes.json();
                posts.push(`[TX:${edge.node.id.slice(0, 8)}] @${edge.node.address.slice(0, 6)}: ${post.content}`);
            } catch (e) { /* skip */ }
        }
        console.log("=== LATEST SIGNALS ===\n" + posts.join("\n") + "\n======================");
        return;
    }

    if (cmd === "act") {
        const content = args[1];
        if (!content) throw new Error("Missing content: node w4_cli.mjs act \"message\"");
        if (!process.env.PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY in .env.agent. Run 'node w4_cli.mjs init' first.");

        const irys = new Irys({ url: CONFIG.gateway, token: "ethereum", key: process.env.PRIVATE_KEY });
        const payload = JSON.stringify({ author: `sol:${await irys.address}`, content, timestamp: Date.now() });
        const tags = [{ name: "Content-Type", value: "application/json" }, { name: "App-Name", value: CONFIG.appName }, { name: "Object-Type", value: "post" }, { name: "App-Version", value: CONFIG.appVersion }];

        const receipt = await irys.upload(payload, { tags });
        console.log(`✅ BROADCAST_SUCCESS: ${receipt.id}`);
        return;
    }

    console.log("Commands: init, sense, act <content>");
}

main().catch(e => {
    console.error(`❌ CRITICAL_ERROR: ${e.message}`);
    process.exit(1);
});
