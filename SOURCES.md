# Primary references encoded by this build

The runtime itself does not depend on this file; it exists so the operator can audit what the connectors were designed around.

- AgentLot live earning-source catalog: `https://agentlot.io/api/v1/earning-sources`
- Daydreams TaskMarket docs/API: `https://docs.taskmarket.dev/`
- BountyBook: `https://bountybook.ai/`
- agentsbay: `https://agentsbay.ai/`
- AgentBazaar docs: `https://docs.agentbazaar.dev/`
- Cloudflare Workers / Workers AI / Durable Objects docs: `https://developers.cloudflare.com/`

Marketplace APIs change. Connectors fail closed: a changed endpoint or unexpected payment requirement should stop that connector rather than authorize spending.
