import { asArray, fetchJson, jsonHeaders, netFrom, textOf } from '../utils.js';
import { draftProposal } from '../ai.js';

const BASE = 'https://clawgig.ai/api/v1';

function auth(env) { return jsonHeaders(env.CLAWGIG_API_KEY); }

export const clawgig = {
  id: 'clawgig', name: 'ClawGig', feeBps: 1000,
  canExecute(env) { return Boolean(env.CLAWGIG_API_KEY); },
  async list(env) {
    const data = await fetchJson(`${BASE}/gigs?status=open&sort=budget_high&limit=50`, { headers: auth(env) });
    const gigs = asArray(data, ['gigs']);
    return gigs.map(g => {
      const budget = Number(g.budget_usdc ?? g.fixed_budget_usdc ?? g.budget?.max ?? 0);
      return {
        source: 'clawgig', id: String(g.id), title: g.title || `ClawGig ${g.id}`,
        description: textOf(g.description, g.deliverables, g.requirements), requirements: g.requirements || {}, category: String(g.category || 'other').toLowerCase(),
        grossUsd: budget, netUsd: netFrom(budget, 1000), feeBps: 1000,
        exclusive: false, requiresSpend: false, autoCategoryStrict: true, raw: g
      };
    }).filter(x => !['code','development','design'].includes(x.category));
  },
  async claim(env, op) {
    const budget = Number(op.grossUsd || 0);
    const proposed = Math.max(5, Math.round((budget * (budget >= 25 ? 0.92 : 0.88)) * 100) / 100);
    const p = await draftProposal(env, op, proposed);
    const data = await fetchJson(`${BASE}/gigs/${encodeURIComponent(op.id)}/proposals`, {
      method: 'POST', headers: auth(env), body: JSON.stringify({
        cover_letter: p.cover_letter,
        proposed_amount_usdc: proposed,
        estimated_hours: Math.max(0.25, Number(p.estimated_hours || 1))
      })
    });
    return { ok: true, pendingAward: true, proposedUsd: proposed, data };
  },
  async pending(env) {
    const data = await fetchJson(`${BASE}/agents/me/contracts?status=active&limit=50`, { headers: auth(env) });
    const funded = await fetchJson(`${BASE}/agents/me/contracts?status=funded&limit=50`, { headers: auth(env) }).catch(() => ({ data: [] }));
    return [...asArray(data, ['contracts']), ...asArray(funded, ['contracts'])];
  },
  contractToOpportunity(c) {
    return {
      source: 'clawgig', id: String(c.gig_id || c.id), contractId: String(c.id), title: c?.gigs?.title || `ClawGig contract ${c.id}`,
      description: textOf(c?.gigs?.description, c.delivery_requirements), requirements: c?.gigs || {}, category: String(c?.gigs?.category || 'content').toLowerCase(),
      grossUsd: Number(c.amount_usdc || 0), netUsd: netFrom(c.amount_usdc, 1000), feeBps: 1000, exclusive: true, requiresSpend: false, raw: c
    };
  },
  async submitContract(env, op, work) {
    const content = work.deliverable_json ? JSON.stringify(work.deliverable_json, null, 2) : work.deliverable_text;
    return fetchJson(`${BASE}/contracts/${encodeURIComponent(op.contractId)}/deliver`, {
      method: 'POST', headers: auth(env), body: JSON.stringify({ delivery_notes: content })
    });
  }
};
