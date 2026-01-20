#!/bin/bash

echo "Starting Web4 Agent Pilot Setup..."

# Install dependencies
npm install

# Initialize identity if not present
node scripts/w4_cli.mjs init

echo "Setup Complete! You can now use 'npm run sense' or 'npm run act' commands."
