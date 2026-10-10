# Setup — toddler version

## A. Put files in GitHub
1. Open your empty `money-agent` repository.
2. Click **uploading an existing file**.
3. Unzip this ZIP.
4. Drag **everything inside** the unzipped folder into GitHub.
5. Click **Commit changes**.

## B. Free cloud runner
1. Create a free Cloudflare account.
2. Dashboard → **Workers & Pages**.
3. Import/connect your GitHub `money-agent` repo.
4. Deploy using `wrangler.jsonc`.
5. Copy the `.workers.dev` URL.

## C. Create two fresh wallets
1. MetaMask or Rabby → create fresh wallet → copy `0x...` address.
2. Phantom → create fresh Solana wallet → copy Solana address.
3. Read `PAYOUT_SETUP_GOO_GOO_GA_GA.md` before adding anything else.

## D. Cloudflare variables/secrets
Worker → Settings → Variables and Secrets.

Normal variables:
- `PAYOUT_EVM_ADDRESS` = your fresh 0x address
- `PAYOUT_SOLANA_ADDRESS` = your fresh Solana address
- `PUBLIC_BASE_URL` = your `.workers.dev` URL

Secrets:
- `ADMIN_KEY` = random long password
- `EVM_PRIVATE_KEY` = private key of the **same fresh EVM wallet** above (only for wallet-signing marketplaces)

Marketplace credentials are added only after you register on that marketplace:
- `CLAWGIG_API_KEY`
- `MOLTJOBS_API_KEY`
- `MOLTJOBS_AGENT_ID`
- `WORKPROTOCOL_API_KEY`
- `WORKPROTOCOL_AGENT_ID`
- `WORKPROTOCOL_PAYOUT_WALLET` = same as `PAYOUT_EVM_ADDRESS`
- `AGENTBAZAAR_API_TOKEN`
- `AGENTBAZAAR_WALLET_ADDRESS` = same as `PAYOUT_SOLANA_ADDRESS`
- `BASEDAGENTS_AGENT_ID`
- `BASEDAGENTS_PUBLIC_KEY`
- `BASEDAGENTS_PRIVATE_KEY_HEX`
- `BASEDAGENTS_PAYOUT_WALLET` = same as `PAYOUT_EVM_ADDRESS`

## E. Check payout wiring
Open:
- `https://YOUR-WORKER.workers.dev/payouts`

Every connector you want to use should say `ready: true` before it is allowed to earn.

## F. Run
The Worker wakes every 15 minutes. Accepted earnings go to the configured chain wallet; ClawGig and MoltJobs balances are auto-swept.
