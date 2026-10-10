import { DEFAULT_CAPABILITIES } from '../config.js';
import { asArray, fetchJson, jsonHeaders, netFrom, sha256Hex, textOf, uniqueBy } from '../utils.js';
import { evmAccount, signEip191 } from '../wallet.js';

const BASE = 'https://agentsbay.ai/api/v1';

async function ensureRegistered(env) {
  const account = evmAccount(env);
  try {
    const profile = await fetchJson(`${BASE}/agent/${account.address}`);
    if (profile) return account.address;
  } catch (e) {
    if (e.status && e.status !== 404) throw e;
  }
  if (!env.PUBLIC_BASE_URL) throw new Error('PUBLIC_BASE_URL required for agentsbay first-time registration');
  const reg = await fetchJson(`${BASE}/register`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({
      wallet: account.address,
      name: env.AGENT_NAME || 'Onigiri Money Agent',
      endpoint: `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/agentsbay`,
      capabilities: ['research', 'writing', 'data_analysis'],
      pricing: { research: '10 USDC', writing: '10 USDC', data_analysis: '15 USDC' },
      axl_support: false
    })
  });
  const challenge = reg?.challenge || reg?.nonce;
  if (!challenge) throw new Error('agentsbay registration challenge missing');
  const { signature } = await signEip191(env, challenge);
  await fetchJson(`${BASE}/register/verify`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ wallet: account.address, signature })
  });
  return account.address;
}

export const agentsbay = {
  id: 'agentsbay', name: 'agentsbay', feeBps: 1500,
  canExecute(env) { return Boolean(env.EVM_PRIVATE_KEY); },
  async list() {
    const all = [];
    for (const cap of DEFAULT_CAPABILITIES) {
      try {
        const data = await fetchJson(`${BASE}/tasks/available?capability=${encodeURIComponent(cap)}&limit=25`);
        for (const t of asArray(data, ['tasks'])) all.push(t);
      } catch {}
    }
    return uniqueBy(all, t => String(t.id)).map(t => ({
      source: 'agentsbay', id: String(t.id), title: t.title || `agentsbay task ${t.id}`,
      description: textOf(t.context, t.description), requirements: t.requirements || {}, category: String(t.capability || 'other').toLowerCase(),
      grossUsd: Number(t.budget_usdc || 0), netUsd: netFrom(t.budget_usdc, 1500), feeBps: 1500,
      exclusive: true, requiresSpend: false, autoCategoryStrict: true, raw: t
    }));
  },
  async claim(env, op) {
    const address = await ensureRegistered(env);
    const data = await fetchJson(`${BASE}/task/${encodeURIComponent(op.id)}/claim`, {
      method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ agent_wallet: address })
    });
    return { ok: true, address, data };
  },
  async submit(env, op, claim, work) {
    const result = work.deliverable_json ? JSON.stringify(work.deliverable_json) : work.deliverable_text;
    const hash = `0x${await sha256Hex(result)}`;
    return fetchJson(`${BASE}/task/${encodeURIComponent(op.id)}/deliver`, {
      method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ result, result_hash: hash })
    });
  }
};
