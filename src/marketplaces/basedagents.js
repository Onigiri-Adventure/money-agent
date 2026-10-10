import * as ed from '@noble/ed25519';
import { asArray, fetchJson, jsonHeaders, sha256Hex, textOf } from '../utils.js';

const BASE = 'https://api.basedagents.ai';

function hexToBytes(hex) {
  const s = String(hex || '').replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(s)) throw new Error('BASEDAGENTS_PRIVATE_KEY_HEX must be 32-byte hex');
  return new Uint8Array(s.match(/.{2}/g).map(x => parseInt(x, 16)));
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function authHeaders(env, method, path, body = '') {
  const publicKey = String(env.BASEDAGENTS_PUBLIC_KEY || '').trim();
  if (!publicKey) throw new Error('BASEDAGENTS_PUBLIC_KEY missing');
  const priv = hexToBytes(env.BASEDAGENTS_PRIVATE_KEY_HEX);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256Hex(body || '');
  const msg = `${method.toUpperCase()}:${path}:${timestamp}:${bodyHash}:${nonce}`;
  const sig = await ed.signAsync(new TextEncoder().encode(msg), priv);
  return {
    ...jsonHeaders(),
    Authorization: `AgentSig ${publicKey}:${bytesToBase64(sig)}`,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce
  };
}

function bountyUsd(t) {
  const b = t?.bounty || {};
  if (b.amount_display != null) return Number(b.amount_display) || 0;
  if (b.amount_atomic != null) return Number(b.amount_atomic) / 1_000_000 || 0;
  if (b.amount != null) {
    const n = Number(b.amount) || 0;
    return n > 100000 ? n / 1_000_000 : n;
  }
  return Number(t?.reward_usdc || 0);
}

async function ensureWallet(env) {
  const id = String(env.BASEDAGENTS_AGENT_ID || '').trim();
  const wanted = String(env.PAYOUT_EVM_ADDRESS || '').trim().toLowerCase();
  const w = await fetchJson(`${BASE}/v1/agents/${encodeURIComponent(id)}/wallet`);
  const address = String(w?.wallet_address || w?.address || w?.wallet?.address || '').toLowerCase();
  const network = String(w?.wallet_network || w?.network || w?.wallet?.network || '');
  if (!address || address !== wanted) throw new Error('BasedAgents payout wallet does not match PAYOUT_EVM_ADDRESS');
  if (network && network !== 'eip155:8453') throw new Error(`BasedAgents wallet network is ${network}, expected eip155:8453 (Base)`);
  return { address, network: network || 'eip155:8453' };
}

export const basedagents = {
  id: 'basedagents', name: 'BasedAgents', feeBps: 0,
  canExecute(env) {
    return Boolean(env.BASEDAGENTS_AGENT_ID && env.BASEDAGENTS_PUBLIC_KEY && env.BASEDAGENTS_PRIVATE_KEY_HEX && env.PAYOUT_EVM_ADDRESS);
  },
  async list(env) {
    await ensureWallet(env);
    const data = await fetchJson(`${BASE}/v1/tasks?status=open`);
    const tasks = asArray(data, ['tasks', 'items']);
    return tasks.map(t => {
      const gross = bountyUsd(t);
      const network = String(t?.bounty?.network || 'eip155:8453');
      return {
        source: 'basedagents', id: String(t.id || t.task_id), title: t.title || `BasedAgents ${t.id || t.task_id || ''}`,
        description: textOf(t.description, t.acceptance_criteria, t.requirements),
        requirements: t.requirements || {}, category: String(t.category || 'other').toLowerCase(),
        grossUsd: gross, netUsd: gross, feeBps: 0, exclusive: true, requiresSpend: false,
        autoCategoryStrict: false, raw: t, payoutNetwork: network
      };
    }).filter(x => x.grossUsd > 0 && x.payoutNetwork === 'eip155:8453');
  },
  async claim(env, op) {
    const path = `/v1/tasks/${encodeURIComponent(op.id)}/claim`;
    const body = '';
    const headers = await authHeaders(env, 'POST', path, body);
    delete headers['content-type'];
    const data = await fetchJson(`${BASE}${path}`, { method: 'POST', headers });
    return { ok: true, data };
  },
  async submit(env, op, claim, work) {
    const path = `/v1/tasks/${encodeURIComponent(op.id)}/deliver`;
    const payload = {
      summary: work.notes || 'Completed by autonomous worker.',
      submission_type: 'json',
      submission_content: JSON.stringify(work.deliverable_json || { result: work.deliverable_text })
    };
    const body = JSON.stringify(payload);
    const headers = await authHeaders(env, 'POST', path, body);
    return fetchJson(`${BASE}${path}`, { method: 'POST', headers, body });
  }
};
