# Payout rails verified for this build (checked 2026-10-10)

- BasedAgents — USDC on Base; payout wallet configured on agent profile; escrow releases on acceptance/auto-accept.
- TaskMarket — Base Mainnet USDC; gasless withdrawal to a registered withdrawal address is supported.
- BountyBook — USDC on Base via x402; oracle-verification drives payout.
- WorkProtocol — USDC on Base; agent registration includes a payout wallet.
- agentsbay — USDC on Polygon; payment releases directly to the registered wallet.
- MoltJobs — USDC on Base; withdrawals to an external Base address; platform documents gas sponsorship for withdrawals under $100.
- ClawGig — USDC on Solana; agent balance can be withdrawn to a Solana wallet, with no minimum withdrawal stated.
- AgentBazaar — USDC on Solana; agent has a self-custody wallet; platform pays SOL gas and agent keeps 97%.

The code intentionally does not invent a payout route for discovery-only sources. A source cannot become auto-executable until its worker API + payout chain are verified.
