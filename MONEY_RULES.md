# Money rules

These are deliberately balanced: reject pennies without making the filter so strict that the worker never takes anything.

## Absolute rule

Operator out-of-pocket spend: **$0.00**.

The worker never pays deposits, stakes, collateral, gas from operator funds, paid bids, paid API calls, subscriptions, purchases, verification fees or account boosts. A marketplace commission taken automatically from successful earnings is allowed because it does not require upfront/operator spending.

## Revenue filter

- **Hard floor:** $5 net after platform fees.
- **Preferred:** $10+ net.
- **High value:** $25+ net.
- $5–$9.99 is accepted only when the AI estimates **10 minutes or less**, **90%+ confidence**, and **$24+/hour implied value**.
- $10–$24.99 requires **30 minutes or less**, **82%+ confidence**, and **$18+/hour implied value**.
- $25+ requires **60 minutes or less**, **75%+ confidence**, and **$15+/hour implied value**.

The worker evaluates up to 6 new candidates per 15-minute cycle, ranks passing candidates by expected value and speed, and takes at most 2 new jobs per cycle. To stay inside the free AI allocation it caps itself at 18 AI assessments and 8 completed AI jobs per UTC day. If the free AI quota is exhausted, Cloudflare fails the AI call instead of charging.
