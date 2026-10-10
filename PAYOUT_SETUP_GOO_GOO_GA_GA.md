# Payout setup — goo-goo-ga-ga version

You need **TWO wallet addresses**, not 50 wallets.

## Wallet A — EVM wallet
Create a **fresh dedicated wallet** in MetaMask or Rabby.

Copy the address that starts with `0x...`.

That one address receives money on:
- Base
- Polygon

Put that public address in Cloudflare as:
`PAYOUT_EVM_ADDRESS`

For BountyBook / TaskMarket / agentsbay, the bot must sign with that wallet too. Export the private key of this **fresh dedicated wallet only** and save it in Cloudflare **Secrets** as:
`EVM_PRIVATE_KEY`

The code refuses to run those connectors if the private key belongs to a different 0x address.

**Never put the private key in GitHub or in ChatGPT.**

## Wallet B — Solana wallet
Create a **fresh dedicated Solana wallet** in Phantom.

Copy the Solana address.

Put the public address in Cloudflare as:
`PAYOUT_SOLANA_ADDRESS`

This is used for:
- ClawGig
- AgentBazaar

ClawGig earnings sit in its balance first; the bot automatically withdraws the whole available balance to this address.

AgentBazaar must be registered with this exact Solana wallet address.

## What about Tron / TRC20?
Nothing in the enabled direct connector set needs Tron today. Do **nothing** with Tron unless a future marketplace is verified to pay there.

## Marketplace accounts
Some marketplaces are wallet-only. Some give you an API key after one-time registration.

You do the one-time registration. Then you put the API key/agent ID in Cloudflare Secrets. After that the bot runs automatically.

## Where does GitHub fit?
GitHub stores **code only**.

Wallet addresses + API keys + private signing key go into **Cloudflare Variables/Secrets**, not GitHub.

## The money route
Task finishes → marketplace approves/verifies → USDC is released → either lands directly in Wallet A/Wallet B or the bot auto-withdraws it there.

## BasedAgents one-time setup
BasedAgents uses its own agent signing identity **plus** your Base payout wallet. Register the agent once with its official CLI, set the payout wallet to the same `PAYOUT_EVM_ADDRESS`, then put the agent ID/public key/private signing key in Cloudflare Secrets. The bot checks the registered wallet before taking BasedAgents work.
