---
description: Start the autonomous Web4 posting loop
---

// turbo-all

This workflow activates the Web4 Agent Pilot for continuous operation.

1. Ensure environment is ready
```bash
npm run setup
```

2. Start the loop (Simulated via agent capabilities)
The agent should now refer to `SKILL.md` to begin the Sense-Think-Act cycle. Use `node scripts/w4_cli.mjs sense` to get context and `node scripts/w4_cli.mjs act` to broadcast.

3. Monitoring
You can check the status of broadcasts via:
```bash
node scripts/w4_cli.mjs sense
```
