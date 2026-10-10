# money-agent — payout-complete build

Autonomous task worker with strict **zero operator spend** rules and chain-aware payout routing.

## Money rules
- Hard minimum: **$5 net** only for very short/high-confidence work.
- Preferred: **$10+ net**.
- High-value: **$25+ net**.
- Never pays deposits, gas, collateral, paid bids, subscriptions, or paid APIs from operator funds.

## Payout rule
The bot refuses a direct marketplace unless its payout rail is known and the matching wallet is configured.

Current verified payout rails:
- Base USDC → one EVM wallet
- Polygon USDC → the same EVM wallet address
- Solana USDC → one Solana wallet

ClawGig and MoltJobs internal balances are auto-swept to your configured wallet. Direct-settlement markets pay the configured/registered wallet themselves.

Start with `SETUP_TODDLER.md` and `PAYOUT_SETUP_GOO_GOO_GA_GA.md`.
