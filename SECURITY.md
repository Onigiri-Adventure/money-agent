# Security

- Never commit seed phrases, private keys, API keys, recovery codes, or passwords to GitHub.
- Use **fresh dedicated bot wallets**, not your main savings wallet.
- EVM signing marketplaces require `EVM_PRIVATE_KEY` in Cloudflare **Secrets**. The code checks that the derived address matches `PAYOUT_EVM_ADDRESS` before those connectors can run.
- `PAYOUT_EVM_ADDRESS` and `PAYOUT_SOLANA_ADDRESS` are public addresses and may be normal Cloudflare variables.
- Do not use a Gate.io exchange deposit address as the bot's signing wallet. Exchange addresses cannot sign marketplace authentication challenges.
- The bot never intentionally funds requester-side escrow, deposits collateral, buys bid credits, or pays gas from operator funds.
