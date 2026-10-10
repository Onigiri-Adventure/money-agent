# Marketplace coverage — final build, 2026-10-09

`/sources` downloads AgentLot's live source catalog. AgentLot currently reports **55 earning sources**, including **52 marked `zero_spend_start=true`**. The package also tracks separately verified zero-cost routes such as AgentBazaar. See `ZERO_COST_SOURCE_REGISTRY.json`.

Important: a source can be **included** without being blindly auto-executed. The worker only performs writes where the worker-side API/auth path is sufficiently known and where it can fail closed rather than accidentally spend money.

## Direct automated worker paths

- **BountyBook** — browse → wallet auth → claim → create text/data/research deliverable → submit. Platform fee comes from earnings.
- **Daydreams TaskMarket** — **claim mode only**, **deposit-free only**. Free claim and free submission path only. The code never supplies X402 payment authorization.
- **agentsbay** — browse research/writing/data tasks → claim → deliver. Live site currently advertises 0% under $1k lifetime GMV and up to 7% at higher tiers; the bot conservatively prices jobs as if 7% were deducted.
- **WorkProtocol** — text/research/data/content API path. If credentials or the free worker path fail, it simply disables itself.
- **ClawGig** — browse → free proposal → watch awarded contracts → deliver. The bot does not pay for profile boosts, bids or anything else.
- **MoltJobs** — funded jobs → only the included free bid allowance → monitor awards → deliver. When free bids reach zero, it stops bidding and never buys more.
- **AgentBazaar** — register the agent at a fixed price (default package assumption: **15 USDC/task**) and give the Worker the free API token. The bot polls assigned tasks and returns results. AgentBazaar states registration/browsing/quoting are free, agents keep 97%, and the platform pays SOL gas.

## Discovery/catalog coverage

The live registry also includes zero-spend routes such as t2000, TaskBounty, Frantic, trybounty.ai, AgentPact, NEAR Agent Market, Agent Hansa, AgentHire, Toku, Algora, boss.dev, Dework, Opire, Stacker News, Superteam Earn, Drips Wave, competitions, hackathons, content monetization and API monetization routes.

They stay visible in `/sources` and in `ZERO_COST_SOURCE_REGISTRY.json`. They are not given generic write access unless their current worker API can be used safely and honestly from this serverless runner.

Security bounty sites are cataloged but **never generically probed/exploited** by this bot. Any such work would require explicit scope-specific authorization and a purpose-built connector.

## Strict exclusions

Even if a directory labels them “zero-spend start,” this build rejects any route that actually requires worker-funded money. Current explicit blocks include:

- **Clawlancer** if its worker flow requires worker ETH gas.
- **TaskForce** while withdrawal gas is not fully sponsored.
- **BasedAgents / bonded bounty systems** if a refundable claim bond is required.
- Any source marked `zero_spend_start=false`.
- Any individual task asking for a purchase, deposit, stake, paid API, gas, fee or funded account.

The rule is literal: **the operator never has to put money in to make the bot work.**

## Payout safety added 2026-10-10

A connector is now blocked unless `src/payouts.js` has a verified payout rail and the matching wallet address is configured. The live direct rails are Base USDC, Polygon USDC, and Solana USDC. Discovery-only catalog entries cannot earn or move money until their worker API and payout route are verified and implemented.
