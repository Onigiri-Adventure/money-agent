import { asArray, fetchJson, jsonHeaders, netFrom, textOf } from '../utils.js';
import { draftProposal } from '../ai.js';

const BASE = 'https://api.moltjobs.io/v1';
function auth(env) { return jsonHeaders(env.MOLTJOBS_API_KEY); }
function unwrap(x) { return x?.data ?? x; }

export const moltjobs = {
  id: 'moltjobs', name: 'MoltJobs', feeBps: 500,
  canExecute(env) { return Boolean(env.MOLTJOBS_API_KEY); },
  async list(env) {
    const data = unwrap(await fetchJson(`${BASE}/jobs?status=OPEN&funded=true&limit=50`, { headers: auth(env) }));
    const jobs = asArray(data, ['jobs', 'items']);
    return jobs.map(j => {
      const gross = Number(j.budgetUsdc ?? j.budget_usdc ?? j.proposedUsdc ?? j.budget ?? 0);
      return {
        source: 'moltjobs', id: String(j.id), title: j.title || `MoltJobs ${j.id}`,
        description: textOf(j.description, j.requirements, j.input), requirements: j.requirements || j.template || {}, category: String(j.vertical || j.category || 'other').toLowerCase(),
        grossUsd: gross, netUsd: netFrom(gross, 500), feeBps: 500, exclusive: false, requiresSpend: false,
        autoCategoryStrict: false, raw: j
      };
    }).filter(x => !/security|audit/i.test(`${x.category} ${x.title}`));
  },
  async allowance(env) {
    if (!env.MOLTJOBS_AGENT_ID) return { remaining: 10 };
    try {
      const d = unwrap(await fetchJson(`${BASE}/bids/allowance/${encodeURIComponent(env.MOLTJOBS_AGENT_ID)}`, { headers: auth(env) }));
      const free = Number(d.freeBidsLimit ?? 10), used = Number(d.freeBidsUsed ?? 0);
      return { remaining: Math.max(0, free - used), raw: d };
    } catch { return { remaining: 0 }; }
  },
  async claim(env, op) {
    const allowance = await this.allowance(env);
    if (allowance.remaining <= 0) return { ok: false, reason: 'no free MoltJobs bid credits remaining; bot will not buy more' };
    const budget = Number(op.grossUsd || 0);
    const proposed = Math.max(5, Math.round((budget * (budget >= 25 ? 0.92 : 0.88)) * 100) / 100);
    const p = await draftProposal(env, op, proposed);
    const data = unwrap(await fetchJson(`${BASE}/jobs/${encodeURIComponent(op.id)}/bids`, {
      method: 'POST', headers: auth(env), body: JSON.stringify({
        proposedUsdc: proposed.toFixed(2), coverLetter: p.cover_letter, etaHours: Math.max(1, Math.ceil(Number(p.estimated_hours || 1)))
      })
    }));
    return { ok: true, pendingAward: true, proposedUsd: proposed, data };
  },
  async pending(env) {
    const data = unwrap(await fetchJson(`${BASE}/jobs?mine=true&limit=50`, { headers: auth(env) }).catch(() => ({ jobs: [] })));
    return asArray(data, ['jobs', 'items']).filter(j => ['ASSIGNED','IN_PROGRESS'].includes(String(j.status || '').toUpperCase()));
  },
  assignedToOpportunity(j) {
    const gross = Number(j.agreedUsdc ?? j.proposedUsdc ?? j.budgetUsdc ?? j.budget_usdc ?? 0);
    return {
      source: 'moltjobs', id: String(j.id), title: j.title || `MoltJobs ${j.id}`,
      description: textOf(j.description, j.requirements, j.input), requirements: j.requirements || j.template || {}, category: String(j.vertical || j.category || 'other').toLowerCase(),
      grossUsd: gross, netUsd: netFrom(gross, 500), feeBps: 500, exclusive: true, requiresSpend: false, raw: j
    };
  },
  async start(env, op) {
    try { return unwrap(await fetchJson(`${BASE}/jobs/${encodeURIComponent(op.id)}/start`, { method: 'POST', headers: auth(env), body: '{}' })); }
    catch (e) { if (e.status === 409) return { alreadyStarted: true }; throw e; }
  },
  async submitAssigned(env, op, work) {
    const output = work.deliverable_json || { result: work.deliverable_text };
    return unwrap(await fetchJson(`${BASE}/jobs/${encodeURIComponent(op.id)}/submit`, {
      method: 'POST', headers: auth(env), body: JSON.stringify({ output, summary: work.notes || 'Completed by autonomous worker.' })
    }));
  }
};
