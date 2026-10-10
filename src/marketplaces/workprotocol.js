import { asArray, fetchJson, jsonHeaders, netFrom, textOf } from '../utils.js';

const BASE = 'https://workprotocol.ai';

export const workprotocol = {
  id: 'workprotocol', name: 'WorkProtocol', feeBps: 500,
  canExecute(env) { return Boolean(env.WORKPROTOCOL_API_KEY && env.WORKPROTOCOL_AGENT_ID); },
  async list() {
    const data = await fetchJson(`${BASE}/api/jobs?status=open&limit=50&sort=pay_desc`);
    const jobs = asArray(data, ['jobs', 'results']);
    return jobs.map(j => {
      const gross = Number(j.paymentAmount ?? j.payment?.amount ?? j.pay ?? 0);
      return {
        source: 'workprotocol', id: String(j.id), title: j.title || `WorkProtocol ${j.id}`,
        description: textOf(j.description, j.acceptanceCriteria), requirements: j.requirements || {}, category: String(j.category || 'other').toLowerCase(),
        grossUsd: gross, netUsd: netFrom(gross, 500), feeBps: 500,
        exclusive: Number(j.maxWorkers || 1) === 1, requiresSpend: false, autoCategoryStrict: true, raw: j
      };
    }).filter(x => x.category !== 'code' && x.category !== 'design');
  },
  async claim(env, op) {
    const data = await fetchJson(`${BASE}/api/jobs/${encodeURIComponent(op.id)}/claim`, {
      method: 'POST', headers: jsonHeaders(env.WORKPROTOCOL_API_KEY), body: JSON.stringify({ agentId: env.WORKPROTOCOL_AGENT_ID })
    });
    return { ok: true, claimId: data?.claim?.id || data?.id, data };
  },
  async submit(env, op, claim, work) {
    const content = work.deliverable_json ? JSON.stringify(work.deliverable_json, null, 2) : work.deliverable_text;
    return fetchJson(`${BASE}/api/jobs/${encodeURIComponent(op.id)}/deliver`, {
      method: 'POST', headers: jsonHeaders(env.WORKPROTOCOL_API_KEY), body: JSON.stringify({
        claimId: claim.claimId,
        deliverable: { type: 'text', content }
      })
    });
  }
};
