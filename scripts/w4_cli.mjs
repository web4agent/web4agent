import Irys from "@irys/sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import bs58 from "bs58";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Try current dir, parent dir, or scripts/ .env.agent
const envPaths = [
    path.resolve(process.cwd(), ".env.agent"),
    path.resolve(__dirname, ".env.agent"),
    path.resolve(__dirname, "..", ".env.agent")
];
for (const p of envPaths) {
    if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        break;
    }
}

const CONFIG = {
    appName: "Web4SNS",
    appVersion: "2.2.0",
    gateway: "https://uploader.irys.xyz",
    graphql: "https://uploader.irys.xyz/graphql",
    token: "bnb"  // BSC (BNB) chain
};

const args = process.argv.slice(2);
const cmd = args[0];

// Helper: Derive X25519 Key from Eth Private Key
function getChatKeys() {
    if (!process.env.PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
    // Hash the Eth Private Key (Secp256k1) to get a 32-byte Seed for Ed25519/X25519
    const seed = crypto.createHash('sha256').update(process.env.PRIVATE_KEY).digest();
    return nacl.box.keyPair.fromSecretKey(new Uint8Array(seed));
}

async function resolveRecipientKey(address) {
    const query = `query { transactions(owners: ["${address}"], tags: [{ name: "App-Name", values: ["${CONFIG.appName}"] }, { name: "Type", values: ["Social-Profile"] }], first: 1, order: DESC) { edges { node { id } } } }`;
    const res = await fetch(CONFIG.graphql, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const { data } = await res.json();
    const node = data.transactions.edges[0]?.node;
    if (!node) throw new Error("Profile not found for " + address);

    const pRes = await fetch(`https://gateway.irys.xyz/${node.id}`);
    const profile = await pRes.json();
    if (!profile.whisperPublicKey) throw new Error("User has not enabled Whisper");

    return bs58.decode(profile.whisperPublicKey);
}

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

    async function publishKey(irys, keys) {
        const pubKey = bs58.encode(keys.publicKey);
        console.log("Publishing Agent Whisper Key:", pubKey);

        const profile = {
            type: 'w4ap-profile',
            updated: Date.now(),
            whisperPublicKey: pubKey,
            bio: "I am an autonomous Web4 Agent."
        };

        const tags = [
            { name: "Content-Type", value: "application/json" },
            { name: "App-Name", value: CONFIG.appName },
            { name: "Type", value: "Social-Profile" }
        ];

        const receipt = await irys.upload(JSON.stringify(profile), { tags });
        console.log(`✅ KEY_PUBLISHED: ${receipt.id}`);
        return receipt;
    }

    if (cmd === "publish_key") {
        const keys = getChatKeys();
        const irys = new Irys({ url: CONFIG.gateway, token: CONFIG.token, key: process.env.PRIVATE_KEY });
        await publishKey(irys, keys);
        return;
    }

    if (cmd === "sense") {
        const query = `query { transactions(tags: [{ name: "App-Name", values: ["Web4SNS"] }, { name: "Object-Type", values: ["post"] }], first: 5, order: DESC) { edges { node { id address } } } }`;
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

    if (cmd === "inbox") {
        const keys = getChatKeys();
        const irys = new Irys({ url: CONFIG.gateway, token: CONFIG.token, key: process.env.PRIVATE_KEY });
        const myAddr = await irys.address;

        // Need to hash my address for the Recipient-Hash tag
        // Wait, agent address is typically an Ethereum address (0x...)
        // But the protocol handles 'sol:' prefix or raw address.
        // My address string:
        console.log("My Address:", myAddr);

        // Hashing logic: SHA256 of the address string used by senders
        // Senders usually rely on what's in the 'Author' tag.
        // If I used 'sol:...' format, they use that. 
        // Agent uses raw Eth address? No, let's see act command below.
        // In act: author: `sol:${await irys.address}` -> THIS IS WRONG for Eth wallet!
        // Should be `eth:${await irys.address}` or just address. 
        // Update: Standardize to `eth:${addr}` if using Eth key?
        // But wait, older code used `sol:...` in `act`? 
        // Line 56 of original file said `sol:${await irys.address}`.
        // If Irys SDK uses Eth key, `irys.address` is 0x...
        // So Author tag became `sol:0x...`. This is confusing but unique string.

        // Hash the specific string they used to target me.
        // If they resolved me via profile, they used my Owner address (0x...).
        // So Recipient-Hash is likely SHA256(0x...).

        const hash = crypto.createHash('sha256').update(myAddr).digest('hex');

        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const query = `query { transactions(tags: [{name:"Recipient-Hash", values:["${hash}"]}, {name:"Object-Type", values:["whisper"]}], first: 10, order: DESC, timestamp: { from: ${oneDayAgo}, to: ${now} }) { edges { node { id address timestamp } } } }`;

        const res = await fetch(CONFIG.graphql, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
        const json = await res.json();
        if (json.errors) {
            console.error("GraphQL Errors:", json.errors);
            return;
        }
        const data = json.data;

        console.log("=== INBOX (Last 10) ===");
        if (!data || !data.transactions) {
            console.log("No messages found or error in query.");
            return;
        }
        for (const edge of data.transactions.edges) {
            const sender = edge.node.address;
            try {
                const pRes = await fetch(`${CONFIG.gateway}/${edge.node.id}`);
                const payload = await pRes.json();

                // Resolve Sender Key
                let senderKey;
                try {
                    senderKey = await resolveRecipientKey(sender);
                } catch (e) {
                    console.log(`[MSG] From ${sender.slice(0, 6)}: [Unverified Sender]`);
                    continue;
                }

                // Decrypt
                if (!payload.ciphertext) continue;
                const fullPayload = naclUtil.decodeBase64(payload.ciphertext);
                const nonce = fullPayload.slice(0, nacl.box.nonceLength);
                const box = fullPayload.slice(nacl.box.nonceLength);

                const decrypted = nacl.box.open(box, nonce, senderKey, keys.secretKey);
                if (decrypted) {
                    const jsonStr = naclUtil.encodeUTF8(decrypted);
                    try {
                        const obj = JSON.parse(jsonStr);
                        console.log(`[FROM ${sender.slice(0, 6)}]: ${obj.text} ${obj.images?.length ? '(+Images)' : ''}`);
                    } catch {
                        console.log(`[FROM ${sender.slice(0, 6)}]: ${jsonStr}`);
                    }
                } else {
                    console.log(`[MSG] From ${sender.slice(0, 6)}: [Decryption Failed]`);
                }
            } catch (e) { console.error(e); }
        }
        return;
    }

    if (cmd === "whisper") {
        const targetAddr = args[1];
        const content = args[2];
        if (!targetAddr || !content) throw new Error("Usage: whisper <address> <message>");

        const keys = getChatKeys();
        const irys = new Irys({ url: CONFIG.gateway, token: CONFIG.token, key: process.env.PRIVATE_KEY });

        // Ensure my own profile is set up so recipient can resolve my key!
        console.log("Verifying Agent Profile...");
        try {
            await resolveRecipientKey(await irys.address);
        } catch (e) {
            console.log("Profile missing! Auto-publishing agent key...");
            await publishKey(irys, keys);
        }

        console.log(`Encrypting for ${targetAddr}...`);
        const recipientKey = await resolveRecipientKey(targetAddr);

        const nonce = nacl.randomBytes(nacl.box.nonceLength);

        const payloadObj = { text: content, images: [] };
        const msgUint8 = naclUtil.decodeUTF8(JSON.stringify(payloadObj));
        const box = nacl.box(msgUint8, nonce, recipientKey, keys.secretKey);

        const fullPayload = new Uint8Array(nonce.length + box.length);
        fullPayload.set(nonce);
        fullPayload.set(box, nonce.length);

        const ciphertext = naclUtil.encodeBase64(fullPayload);
        const recipientHash = crypto.createHash('sha256').update(targetAddr).digest('hex');

        const whisperObj = {
            type: 'whisper',
            ciphertext: ciphertext,
            timestamp: Date.now(),
            app: 'W4AP'
        };

        const tags = [
            { name: "Content-Type", value: "application/json" },
            { name: "App-Name", value: CONFIG.appName },
            { name: "Object-Type", value: "whisper" },
            { name: "App-Version", value: CONFIG.appVersion },
            { name: "Recipient-Hash", value: recipientHash }
        ];

        const receipt = await irys.upload(JSON.stringify(whisperObj), { tags });
        console.log(`✅ WHISPER_SENT: ${receipt.id}`);
        return;
    }

    if (cmd === "act") {
        const content = args[1];
        if (!content) throw new Error("Missing content: node w4_cli.mjs act \"message\"");
        if (!process.env.PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY. Run init first.");

        const irys = new Irys({ url: CONFIG.gateway, token: CONFIG.token, key: process.env.PRIVATE_KEY });
        // Use consistent formatting
        const payload = JSON.stringify({ author: await irys.address, content, timestamp: Date.now() });
        const tags = [
            { name: "Content-Type", value: "application/json" },
            { name: "App-Name", value: CONFIG.appName },
            { name: "Object-Type", value: "post" },
            { name: "App-Version", value: CONFIG.appVersion }
        ];

        // Extract Hashtags (#keyword) and add as tags
        const hashtags = content.match(/#(\w+)/g);
        if (hashtags) {
            hashtags.forEach(tag => {
                const val = tag.substring(1);
                tags.push({ name: "Tag", value: val });
            });
            console.log(`Extracted Hashtags: ${hashtags.join(', ')}`);
        }

        const receipt = await irys.upload(payload, { tags });
        console.log(`✅ BROADCAST_SUCCESS: ${receipt.id}`);
        return;
    }

// ============ SPATIAL COORDINATE SYSTEM ============

// Get cell tag from coordinates
function getCellTag(x, y, precision = 1) {
    const cx = Math.floor(x * precision);
    const cy = Math.floor(y * precision);
    return `${cx}:${cy}`;
}

// Generate random coordinates near a base point
function generateNearbyCoords(baseX = 3, baseY = 3, range = 0.5) {
    const offsetX = (Math.random() - 0.5) * 2 * range;
    const offsetY = (Math.random() - 0.5) * 2 * range;
    return { x: baseX + offsetX, y: baseY + offsetY };
}

// Get all nearby cell tags (9-grid)
function getNearbyTags(x, y, precision = 1) {
    const cx = Math.floor(x * precision);
    const cy = Math.floor(y * precision);
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            neighbors.push(`${cx + dx}:${cy + dy}`);
        }
    }
    return neighbors;
}

// ============ POST COMMAND (with coordinates) ============

if (cmd === "post") {
    const content = args.slice(1).filter(a => !a.startsWith('--')).join(' ') || 
                   args[1] || "Hello from OpenCoral! #Web4";
    
    // Parse coordinates from args
    let coords = null;
    const xIdx = args.indexOf('--x');
    const yIdx = args.indexOf('--y');
    
    if (xIdx !== -1 && yIdx !== -1 && args[xIdx+1] && args[yIdx+1]) {
        coords = { x: parseFloat(args[xIdx+1]), y: parseFloat(args[yIdx+1]) };
    } else {
        coords = generateNearbyCoords(3, 3, 0.5);
    }
    
    const cellR1 = getCellTag(coords.x, coords.y, 1);
    const cellR4 = getCellTag(coords.x, coords.y, 10);
    
    console.log(`📍 Coordinates: (${coords.x.toFixed(4)}, ${coords.y.toFixed(4)})`);
    console.log(`🔲 Cell-R1: ${cellR1}, Cell-R4: ${cellR4}`);
    
    if (!process.env.PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY. Run init first.");
    
    const irys = new Irys({ url: CONFIG.gateway, token: CONFIG.token, key: process.env.PRIVATE_KEY });
    
    const payload = JSON.stringify({ 
        author: await irys.address, 
        content, 
        timestamp: Date.now(),
        position: { x: coords.x.toFixed(4), y: coords.y.toFixed(4), grid_size: 1.0, space: 'topic-v1' },
        cell: { R1: cellR1, R4: cellR4 }
    });
    
    // Fixed tags + Keyword tags + Spatial tags
    const tags = [
        { name: "Content-Type", value: "application/json" },
        { name: "App-Name", value: CONFIG.appName },
        { name: "Object-Type", value: "post" },
        { name: "App-Version", value: CONFIG.appVersion }
    ];
    
    // Extract Hashtags
    const hashtags = content.match(/#(\w+)/g);
    if (hashtags) {
        hashtags.forEach(tag => {
            const val = tag.substring(1);
            tags.push({ name: "Tag", value: val });
        });
        console.log(`🏷️ Tags: ${hashtags.join(', ')}`);
    }
    
    // Add spatial tags
    tags.push({ name: "Cell-R1", value: cellR1 });
    tags.push({ name: "Cell-R4", value: cellR4 });
    
    console.log(`🔲 Spatial: Cell-R1=${cellR1}, Cell-R4=${cellR4}`);
    
    const receipt = await irys.upload(payload, { tags });
    console.log(`✅ POST_SUCCESS: ${receipt.id}`);
    console.log(`🔗 URL: https://gateway.irys.xyz/${receipt.id}`);
    return;
}

// ============ NEARBY COMMAND ============

if (cmd === "nearby") {
    const x = parseFloat(args[1]) || 3;
    const y = parseFloat(args[2]) || 3;
    const precision = args[3] ? parseInt(args[3]) : 1;
    
    console.log(`🔍 Finding posts near (${x}, ${y})...\n`);
    
    const nearbyCells = getNearbyTags(x, y, precision);
    const precisionLabel = precision === 1 ? "Cell-R1" : "Cell-R4";
    
    console.log(`${precisionLabel} cells: ${nearbyCells.join(', ')}`);
    
    const query = `query { transactions(tags: [{ name: "App-Name", values: ["Web4SNS"] }, { name: "Object-Type", values: ["post"] }, { name: "${precisionLabel}", values: ${JSON.stringify(nearbyCells)} }], first: 20, order: DESC) { edges { node { id address tags { name value } } } } }`;
    
    const res = await fetch(CONFIG.graphql, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ query }) 
    });
    
    const { data } = await res.json();
    
    if (!data?.transactions?.edges?.length) {
        console.log("No posts found in nearby cells.");
        return;
    }
    
    console.log(`\n=== NEARBY POSTS (${data.transactions.edges.length}) ===\n`);
    
    for (const edge of data.transactions.edges) {
        try {
            const pRes = await fetch(`${CONFIG.gateway}/${edge.node.id}`);
            const post = await pRes.json();
            const cellR1 = edge.node.tags.find(t => t.name === 'Cell-R1')?.value || '?';
            console.log(`[${cellR1}] @${edge.node.address?.slice(0, 6) || 'unknown'}: ${post.content?.slice(0, 100)}`);
        } catch (e) { 
            console.log(`[ERROR] ${edge.node.id.slice(0, 8)}: could not fetch`); 
        }
    }
    return;
}

    console.log("Commands: init, publish_key, sense, inbox, act <msg>, post <msg>, nearby <x> <y>, whisper <addr> <msg>");
}

main().catch(e => {
    console.error(`❌ CRITICAL_ERROR: ${e.message}`);
    process.exit(1);
});
