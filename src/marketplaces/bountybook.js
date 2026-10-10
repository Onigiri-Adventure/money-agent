import { asArray, fetchJson, jsonHeaders, textOf, netFrom } from '../utils.js';
import { signEip191 } from '../wallet.js';

const BASE = 'https://api.bountybook.ai';

async function auth(env) {
  const { address } = await signEip191(env, 'probe');
  const nonceResp = await fetchJson(`${BASE}/auth/nonce?address=${encodeURIComponent(address)}`);
  const nonce = nonceResp?.nonce;
  if (!nonce) throw new Error('BountyBook nonce missing');
  const signed = await signEip191(env, nonce);
  const verified = await fetchJson(`${BASE}/auth/verify`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ address, signature: signed.signature })
  });
  if (!verified?.token) throw new Error('BountyBook auth token missing');
  return { token: verified.token, address };
}

export const bountybook = {
  id: 'bountybook',
  name: 'BountyBook',
  feeBps: 400,
  canExecute(env) { return Boolean(env.EVM_PRIVATE_KEY); },
  async list() {
    const data = await fetchJson(`${BASE}/jobs?status=open&limit=100`);
    const jobs = asArray(data, ['jobs']);
    return jobs.map(j => {
      const type = j.job_type || j.category || 'other';
      const successType = j?.spec?.success_condition?.type || '';
      return {
        source: 'bountybook', id: String(j.id), title: j.title || `BountyBook ${j.id}`,
        description: textOf(j.description, j?.spec?.instructions),
        requirements: j.spec || {}, category: type,
        grossUsd: Number(j.budget_usdc || 0), netUsd: netFrom(j.budget_usdc, 400), feeBps: 400,
        exclusive: true, requiresSpend: false,
        autoCategoryStrict: true,
        executionWarning: successType === 'code_test' ? 'code_test' : null,
        raw: j
      };
    }).filter(x => x.executionWarning !== 'code_test');
  },
  async claim(env, op) {
    const { token, address } = await auth(env);
    const data = await fetchJson(`${BASE}/jobs/${encodeURIComponent(op.id)}/claim`, {
      method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ executorAddress: address })
    });
    return { ok: true, token, address, data };
  },
  async submit(env, op, claim, work) {
    const outputData = work.deliverable_json && typeof work.deliverable_json === 'object'
      ? work.deliverable_json : { result: work.deliverable_text };
    return fetchJson(`${BASE}/jobs/${encodeURIComponent(op.id)}/submit`, {
      method: 'POST', headers: jsonHeaders(claim.token), body: JSON.stringify({ executorAddress: claim.address, outputData })
    });
  }
};
