import { evmAccount } from './wallet.js';
import { fetchJson, jsonHeaders } from './utils.js';

const MOLTJOBS_BASE = 'https://api.moltjobs.io/v1';
const CLAWGIG_BASE = 'https://clawgig.ai/api/v1';

export const PAYOUT_ROUTES = {
  basedagents: { token: 'USDC', chain: 'Base', chainId: 8453, destination: 'evm', settlement: 'direct' },
  taskmarket: { token: 'USDC', chain: 'Base', chainId: 8453, destination: 'evm', settlement: 'worker-wallet/gasless-withdrawal' },
  bountybook: { token: 'USDC', chain: 'Base', chainId: 8453, destination: 'evm', settlement: 'direct-to-worker-wallet' },
  workprotocol: { token: 'USDC', chain: 'Base', chainId: 8453, destination: 'evm', settlement: 'direct-to-registered-wallet' },
  moltjobs: { token: 'USDC', chain: 'Base', chainId: 8453, destination: 'evm', settlement: 'internal-balance-auto-sweep' },
  agentsbay: { token: 'USDC', chain: 'Polygon', chainId: 137, destination: 'evm', settlement: 'direct-to-registered-wallet' },
  clawgig: { token: 'USDC', chain: 'Solana', destination: 'solana', settlement: 'internal-balance-auto-sweep' },
  agentbazaar: { token: 'USDC', chain: 'Solana', destination: 'solana', settlement: 'direct-to-agent-wallet' }
};

export function isEvmAddress(x) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(x || ''));
}

export function isSolanaAddress(x) {
  const s = String(x || '');
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

export function payoutConfig(env) {
  let derivedEvm = null;
  let evmKeyError = null;
  if (env.EVM_PRIVATE_KEY) {
    try { derivedEvm = evmAccount(env).address; }
    catch (e) { evmKeyError = String(e?.message || e); }
  }
  const evm = String(env.PAYOUT_EVM_ADDRESS || '').trim();
  const sol = String(env.PAYOUT_SOLANA_ADDRESS || '').trim();
  const evmMatchesSigningWallet = Boolean(derivedEvm && evm && derivedEvm.toLowerCase() === evm.toLowerCase());
  return {
    evm: {
      address: evm || null,
      valid: isEvmAddress(evm),
      signingWallet: derivedEvm,
      signingWalletMatchesPayout: evmMatchesSigningWallet,
      keyError: evmKeyError,
      networks: ['Base', 'Polygon']
    },
    solana: {
      address: sol || null,
      valid: isSolanaAddress(sol),
      networks: ['Solana']
    },
    autoSweep: String(env.AUTO_SWEEP_PAYOUTS ?? 'true').toLowerCase() !== 'false'
  };
}

export function payoutReadyForSource(env, source) {
  const route = PAYOUT_ROUTES[source];
  if (!route) return { ok: false, reason: 'No verified payout route for this source.' };
  const cfg = payoutConfig(env);
  if (route.destination === 'evm') {
    if (!cfg.evm.valid) return { ok: false, reason: 'PAYOUT_EVM_ADDRESS missing/invalid.' };
    if (['bountybook','taskmarket','agentsbay'].includes(source) && env.EVM_PRIVATE_KEY && !cfg.evm.signingWalletMatchesPayout) {
      return { ok: false, reason: 'EVM_PRIVATE_KEY wallet does not match PAYOUT_EVM_ADDRESS. Refusing to earn into the wrong wallet.' };
    }
    if (source === 'workprotocol' && env.WORKPROTOCOL_PAYOUT_WALLET && String(env.WORKPROTOCOL_PAYOUT_WALLET).toLowerCase() !== cfg.evm.address.toLowerCase()) {
      return { ok: false, reason: 'WORKPROTOCOL_PAYOUT_WALLET does not match PAYOUT_EVM_ADDRESS.' };
    }
    if (source === 'basedagents' && env.BASEDAGENTS_PAYOUT_WALLET && String(env.BASEDAGENTS_PAYOUT_WALLET).toLowerCase() !== cfg.evm.address.toLowerCase()) {
      return { ok: false, reason: 'BASEDAGENTS_PAYOUT_WALLET does not match PAYOUT_EVM_ADDRESS.' };
    }
  }
  if (route.destination === 'solana') {
    if (!cfg.solana.valid) return { ok: false, reason: 'PAYOUT_SOLANA_ADDRESS missing/invalid.' };
    if (source === 'agentbazaar' && env.AGENTBAZAAR_WALLET_ADDRESS && String(env.AGENTBAZAAR_WALLET_ADDRESS) !== cfg.solana.address) {
      return { ok: false, reason: 'AGENTBAZAAR_WALLET_ADDRESS does not match PAYOUT_SOLANA_ADDRESS.' };
    }
  }
  return { ok: true, route };
}

function bearer(key) {
  return { ...jsonHeaders(), Authorization: `Bearer ${key}` };
}

async function sweepClawGig(env) {
  if (!env.CLAWGIG_API_KEY || !isSolanaAddress(env.PAYOUT_SOLANA_ADDRESS)) return { source: 'clawgig', skipped: true, reason: 'not configured' };
  const bal = await fetchJson(`${CLAWGIG_BASE}/agents/me/balance`, { headers: bearer(env.CLAWGIG_API_KEY) });
  const available = Number(bal?.available_usdc ?? 0);
  if (!(available > 0)) return { source: 'clawgig', ok: true, withdrawn: 0 };
  const out = await fetchJson(`${CLAWGIG_BASE}/agents/me/withdraw`, {
    method: 'POST',
    headers: bearer(env.CLAWGIG_API_KEY),
    body: JSON.stringify({ amount_usdc: Number(available.toFixed(6)), destination_wallet: env.PAYOUT_SOLANA_ADDRESS })
  });
  return { source: 'clawgig', ok: true, withdrawn: Number(available.toFixed(6)), destination: env.PAYOUT_SOLANA_ADDRESS, result: out };
}

async function sweepMoltJobs(env) {
  if (!env.MOLTJOBS_API_KEY || !env.MOLTJOBS_AGENT_ID || !isEvmAddress(env.PAYOUT_EVM_ADDRESS)) {
    return { source: 'moltjobs', skipped: true, reason: 'not configured' };
  }
  const headers = bearer(env.MOLTJOBS_API_KEY);
  const walletResp = await fetchJson(`${MOLTJOBS_BASE}/agents/${encodeURIComponent(env.MOLTJOBS_AGENT_ID)}/wallet`, { headers });
  const wallet = walletResp?.data ?? walletResp;
  let remaining = Number(wallet?.usdcBalance ?? wallet?.balanceUsdc ?? wallet?.availableUsdc ?? 0);
  if (!(remaining > 0)) return { source: 'moltjobs', ok: true, withdrawn: 0 };

  // MoltJobs documents sponsored gas for withdrawals under $100. Split into <=99 USDC chunks
  // so the bot never intentionally creates an operator-funded gas requirement.
  let total = 0;
  const txs = [];
  for (let i = 0; i < 12 && remaining > 0.000001; i++) {
    const amount = Math.min(99, Math.floor(remaining * 1e6) / 1e6);
    if (!(amount > 0)) break;
    const out = await fetchJson(`${MOLTJOBS_BASE}/agents/${encodeURIComponent(env.MOLTJOBS_AGENT_ID)}/wallet/withdraw`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ toAddress: env.PAYOUT_EVM_ADDRESS, amount: amount.toFixed(6) })
    });
    txs.push(out?.data ?? out);
    total += amount;
    remaining = Math.max(0, remaining - amount);
  }
  return { source: 'moltjobs', ok: true, withdrawn: Number(total.toFixed(6)), destination: env.PAYOUT_EVM_ADDRESS, txs };
}

export async function sweepPayouts(env) {
  const cfg = payoutConfig(env);
  if (!cfg.autoSweep) return { enabled: false, results: [] };
  const results = [];
  for (const fn of [sweepClawGig, sweepMoltJobs]) {
    try { results.push(await fn(env)); }
    catch (e) { results.push({ source: fn.name, ok: false, error: String(e?.message || e).slice(0, 800) }); }
  }
  return { enabled: true, results };
}

export function payoutStatus(env) {
  const cfg = payoutConfig(env);
  const sources = Object.fromEntries(Object.entries(PAYOUT_ROUTES).map(([id, route]) => [id, {
    ...route,
    ready: payoutReadyForSource(env, id).ok,
    reason: payoutReadyForSource(env, id).reason || null,
    destinationAddress: route.destination === 'evm' ? cfg.evm.address : cfg.solana.address
  }]));
  return { ...cfg, sources };
}
