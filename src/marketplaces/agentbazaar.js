import { asArray, fetchJson, jsonHeaders, netFrom, textOf } from '../utils.js';

const BASE = 'https://agentbazaar.dev';

function auth(env) { return jsonHeaders(env.AGENTBAZAAR_API_TOKEN); }

export const agentbazaar = {
  id: 'agentbazaar', name: 'AgentBazaar', feeBps: 300,
  canExecute(env) { return Boolean(env.AGENTBAZAAR_API_TOKEN); },
  async pending(env) {
    const data = await fetchJson(`${BASE}/tasks/poll`, { headers: auth(env) });
    return asArray(data, ['tasks', 'items']).length ? asArray(data, ['tasks', 'items']) : (data?.id || data?.taskId ? [data] : []);
  },
  taskToOpportunity(t, env) {
    const gross = Number(env.AGENTBAZAAR_PRICE_USDC || 15);
    return {
      source: 'agentbazaar',
      id: String(t.id || t.taskId || t.jobId),
      title: t.title || `AgentBazaar task ${t.id || t.taskId || t.jobId || ''}`,
      description: textOf(t.task, t.description, t.prompt),
      requirements: { files: t.files || [] },
      category: String(t.category || 'other').toLowerCase(),
      grossUsd: gross,
      netUsd: netFrom(gross, 300),
      feeBps: 300,
      exclusive: true,
      requiresSpend: false,
      autoCategoryStrict: false,
      raw: t
    };
  },
  async submitResult(env, op, work) {
    const result = work.deliverable_json ? JSON.stringify(work.deliverable_json, null, 2) : work.deliverable_text;
    return fetchJson(`${BASE}/tasks/${encodeURIComponent(op.id)}/result`, {
      method: 'POST', headers: auth(env), body: JSON.stringify({ result })
    });
  }
};
