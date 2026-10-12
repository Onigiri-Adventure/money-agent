import { MONEY } from './config.js';
import { hardPolicyCheck, moneyCheck, computeNet } from './policy.js';
import { assessOpportunity } from './ai.js';
import { executeWork } from './work.js';
import { opportunityId, nowIso, n } from './utils.js';
import { bountybook, taskmarket, superteam, agentsbay, workprotocol, clawgig, moltjobs, agentbazaar, basedagents, discoveryOnly } from './marketplaces/index.js';
import { agentLotSummary } from './marketplaces/agentlot.js';
import { payoutReadyForSource, payoutStatus, sweepPayouts } from './payouts.js';
import { bulkOnboard } from './onboard.js';

const DIRECT = [basedagents, bountybook, taskmarket, superteam, agentsbay, workprotocol, clawgig, moltjobs];
const PROPOSAL_SOURCES = new Set(['clawgig', 'moltjobs']);
const SEEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_TTL_MS = 12 * 60 * 60 * 1000;

function todayKey() { return new Date().toISOString().slice(0, 10); }
function safeError(e) { return String(e?.message || e || 'unknown error').slice(0, 900); }

export class MoneyAgent {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/run' && request.method === 'POST') {
      return Response.json(await this.runCycle());
    }
    if (url.pathname === '/onboard' && request.method === 'POST') {
  return Response.json(
    await bulkOnboard(this.env, this.state.storage)
  );
}
    if (url.pathname === '/status') return Response.json(await this.status());
    if (url.pathname === '/events') return Response.json({ events: await this.events(100) });
    return Response.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  async getCounter(name) {
    const k = `counter:${todayKey()}:${name}`;
    return n(await this.state.storage.get(k), 0);
  }

  async incCounter(name, amount = 1) {
    const k = `counter:${todayKey()}:${name}`;
    const next = n(await this.state.storage.get(k), 0) + amount;
    await this.state.storage.put(k, next);
    return next;
  }

  async log(type, data = {}) {
    const ev = { at: nowIso(), type, ...data };
    const current = (await this.state.storage.get('events')) || [];
    current.unshift(ev);
    await this.state.storage.put('events', current.slice(0, 120));
    return ev;
  }

  async events(limit = 50) {
    const current = (await this.state.storage.get('events')) || [];
    return current.slice(0, limit);
  }

  async seenRecently(op, ttlMs = SEEN_TTL_MS) {
    const rec = await this.state.storage.get(`seen:${opportunityId(op)}`);
    if (!rec?.at) return false;
    return Date.now() - Date.parse(rec.at) < ttlMs;
  }

  async markSeen(op, status, detail = {}, ttlHint = null) {
    await this.state.storage.put(`seen:${opportunityId(op)}`, {
      at: nowIso(), status, detail, ttlHint
    });
  }

  connectorState() {
  const direct = DIRECT.map(a => ({
    id: a.id,
    enabled: Boolean(a.canExecute?.(this.env)),
    needs: a.id === 'basedagents' ? ['BASEDAGENTS_AGENT_ID','BASEDAGENTS_PUBLIC_KEY','BASEDAGENTS_PRIVATE_KEY_HEX','PAYOUT_EVM_ADDRESS'] :
      a.id === 'bountybook' || a.id === 'taskmarket' || a.id === 'agentsbay' ? ['EVM_PRIVATE_KEY','PAYOUT_EVM_ADDRESS'] :
      a.id === 'superteam_earn' ? ['SUPERTEAM_AGENT_API_KEY'] :
      a.id === 'workprotocol' ? ['WORKPROTOCOL_API_KEY','WORKPROTOCOL_AGENT_ID','PAYOUT_EVM_ADDRESS'] :
      a.id === 'clawgig' ? ['CLAWGIG_API_KEY','PAYOUT_SOLANA_ADDRESS'] :
      a.id === 'moltjobs' ? ['MOLTJOBS_API_KEY','MOLTJOBS_AGENT_ID','PAYOUT_EVM_ADDRESS'] : []
  }));

  direct.push({
    id: 'agentbazaar',
    enabled: agentbazaar.canExecute(this.env),
    needs: ['AGENTBAZAAR_API_TOKEN'],
    registeredPriceUsd: Number(this.env.AGENTBAZAAR_PRICE_USDC || 15)
  });

  return direct;
}


  async processPendingAwards() {
    const results = [];

    if (agentbazaar.canExecute(this.env)) {
      try {
        for (const t of await agentbazaar.pending(this.env)) {
          if ((await this.getCounter('ai_jobs')) >= MONEY.maxAIJobsPerDay) break;
          if ((await this.getCounter('ai_assessments')) >= MONEY.maxAIAssessmentsPerDay) break;
          const op = agentbazaar.taskToOpportunity(t, this.env);
          const keyOp = { ...op, id: `assigned-${op.id}` };
          if (await this.seenRecently(keyOp, SEEN_TTL_MS)) continue;
          const hard = hardPolicyCheck(op);
          if (!hard.ok) { await this.markSeen(keyOp, 'blocked_award', { reason: hard.reason }); continue; }
          const assessment = await assessOpportunity(this.env, op);
          await this.incCounter('ai_assessments');
          const money = moneyCheck(op, assessment);
          if (!assessment?.take || !money.ok) {
            await this.markSeen(keyOp, 'assigned_rejected', { reason: assessment?.reason || money.reason, assessment, money });
            continue;
          }
          const work = await executeWork(this.env, op);
          await this.incCounter('ai_jobs');
          if (!work?.success) { await this.markSeen(keyOp, 'work_failed', { notes: work?.notes }, RETRY_TTL_MS); continue; }
          const res = await agentbazaar.submitResult(this.env, op, work);
          await this.markSeen(keyOp, 'submitted_award', { result: res, money });
          await this.log('submitted_awarded_job', { source: op.source, id: op.id, netUsd: money.net });
          results.push({ source: op.source, id: op.id, status: 'submitted', netUsd: money.net });
        }
      } catch (e) { await this.log('pending_error', { source: 'agentbazaar', error: safeError(e) }); }
    }

    if (clawgig.canExecute(this.env)) {
      try {
        for (const c of await clawgig.pending(this.env)) {
          if ((await this.getCounter('ai_jobs')) >= MONEY.maxAIJobsPerDay) break;
          const op = clawgig.contractToOpportunity(c);
          const keyOp = { ...op, id: `contract-${op.contractId}` };
          if (await this.seenRecently(keyOp, SEEN_TTL_MS)) continue;
          const hard = hardPolicyCheck(op);
          if (!hard.ok) { await this.markSeen(keyOp, 'blocked_award', { reason: hard.reason }); continue; }
          const work = await executeWork(this.env, op);
          await this.incCounter('ai_jobs');
          if (!work?.success) { await this.markSeen(keyOp, 'work_failed', { notes: work?.notes }, RETRY_TTL_MS); continue; }
          const res = await clawgig.submitContract(this.env, op, work);
          await this.markSeen(keyOp, 'submitted_award', { result: res });
          await this.log('submitted_awarded_job', { source: op.source, id: op.contractId, netUsd: computeNet(op) });
          results.push({ source: op.source, id: op.contractId, status: 'submitted' });
        }
      } catch (e) { await this.log('pending_error', { source: 'clawgig', error: safeError(e) }); }
    }

    if (moltjobs.canExecute(this.env)) {
      try {
        for (const j of await moltjobs.pending(this.env)) {
          if ((await this.getCounter('ai_jobs')) >= MONEY.maxAIJobsPerDay) break;
          const op = moltjobs.assignedToOpportunity(j);
          const keyOp = { ...op, id: `assigned-${op.id}` };
          if (await this.seenRecently(keyOp, SEEN_TTL_MS)) continue;
          const hard = hardPolicyCheck(op);
          if (!hard.ok) { await this.markSeen(keyOp, 'blocked_award', { reason: hard.reason }); continue; }
          await moltjobs.start(this.env, op).catch(() => null);
          const work = await executeWork(this.env, op);
          await this.incCounter('ai_jobs');
          if (!work?.success) { await this.markSeen(keyOp, 'work_failed', { notes: work?.notes }, RETRY_TTL_MS); continue; }
          const res = await moltjobs.submitAssigned(this.env, op, work);
          await this.markSeen(keyOp, 'submitted_award', { result: res });
          await this.log('submitted_awarded_job', { source: op.source, id: op.id, netUsd: computeNet(op) });
          results.push({ source: op.source, id: op.id, status: 'submitted' });
        }
      } catch (e) { await this.log('pending_error', { source: 'moltjobs', error: safeError(e) }); }
    }

    return results;
  }

  async gatherDirect() {
    const opportunities = [];
    const sourceStats = [];
    for (const a of DIRECT) {
      if (!a.canExecute?.(this.env)) {
        sourceStats.push({ source: a.id, status: 'credential_missing', count: 0 });
        continue;
      }
      try {
        const pay = payoutReadyForSource(this.env, a.id);
        if (!pay.ok) {
          sourceStats.push({ source: a.id, status: 'payout_not_ready', count: 0, error: pay.reason });
          continue;
        }
        const items = await a.list(this.env);
        opportunities.push(...items.map(op => ({ ...op, adapter: a })));
        sourceStats.push({ source: a.id, status: 'ok', count: items.length });
      } catch (e) {
        sourceStats.push({ source: a.id, status: 'error', count: 0, error: safeError(e) });
      }
    }
    return { opportunities, sourceStats };
  }

  async gatherDiscoveryOnly() {
    const out = [];
    for (const d of discoveryOnly) {
      try {
        const items = await d.list(this.env);
        out.push({ source: d.id, status: 'ok', count: items.length, top: items.sort((a,b)=>n(b.grossUsd)-n(a.grossUsd)).slice(0,5) });
      } catch (e) {
        out.push({ source: d.id, status: 'error', count: 0, error: safeError(e) });
      }
    }
    await this.state.storage.put('discovery_only', { at: nowIso(), sources: out });
    return out;
  }

  async runCycle() {
    const started = nowIso();
    const lastStarted = await this.state.storage.get('run:started_at');
    if (lastStarted && Date.now() - Date.parse(lastStarted) < 12 * 60 * 1000) {
      return { ok: true, skipped: true, reason: 'previous cycle still inside lock window', started: lastStarted };
    }
    await this.state.storage.put('run:started_at', started);

    const summary = { ok: true, started, pending: [], sourceStats: [], discoveryOnly: [], catalog: null, evaluated: 0, taken: [], skipped: [] };
    try {
      const aiJobsToday = await this.getCounter('ai_jobs');
      if (aiJobsToday < MONEY.maxAIJobsPerDay) summary.pending = await this.processPendingAwards();

      try {
        summary.catalog = await agentLotSummary();
        await this.state.storage.put('catalog:last', { at: nowIso(), ...summary.catalog });
      } catch (e) {
        await this.log('catalog_error', { error: safeError(e) });
      }

      const direct = await this.gatherDirect();
      summary.sourceStats = direct.sourceStats;
      summary.discoveryOnly = await this.gatherDiscoveryOnly();

      const prescreened = [];
      for (const op of direct.opportunities) {
        if (await this.seenRecently(op)) continue;
        const hard = hardPolicyCheck(op);
        if (!hard.ok) {
          await this.markSeen(op, 'hard_block', { reason: hard.reason });
          summary.skipped.push({ source: op.source, id: op.id, reason: hard.reason });
          continue;
        }
        const net = computeNet(op);
        if (net < MONEY.hardMinNet) {
          await this.markSeen(op, 'below_floor', { net });
          continue;
        }
        prescreened.push({ ...op, netUsd: net });
      }
      prescreened.sort((a,b) => n(b.netUsd) - n(a.netUsd));

      let assessments = 0;
      const eligible = [];
      const remainingDailyAssessments = Math.max(0, MONEY.maxAIAssessmentsPerDay - await this.getCounter('ai_assessments'));
      const assessLimit = Math.min(MONEY.maxAIAssessmentsPerCycle, remainingDailyAssessments);

      for (const op of prescreened.slice(0, assessLimit)) {
        if ((await this.getCounter('ai_jobs')) >= MONEY.maxAIJobsPerDay) break;
        let assessment;
        try {
          assessment = await assessOpportunity(this.env, op);
          assessments += 1;
          await this.incCounter('ai_assessments');
          summary.evaluated += 1;
        } catch (e) {
          await this.markSeen(op, 'assessment_error', { error: safeError(e) }, RETRY_TTL_MS);
          summary.skipped.push({ source: op.source, id: op.id, reason: `AI assessment error: ${safeError(e)}` });
          continue;
        }

        const money = moneyCheck(op, assessment);
        if (!assessment?.take || !money.ok) {
          const reason = !assessment?.take ? (assessment?.reason || 'AI rejected') : money.reason;
          await this.markSeen(op, 'rejected', { reason, assessment, money });
          summary.skipped.push({ source: op.source, id: op.id, reason });
          continue;
        }
        eligible.push({ op, assessment, money });
      }

      eligible.sort((a, b) => b.money.score - a.money.score || b.money.net - a.money.net);
      let newJobs = 0;
      for (const candidate of eligible) {
        if (newJobs >= MONEY.maxNewJobsPerCycle) break;
        if ((await this.getCounter('ai_jobs')) >= MONEY.maxAIJobsPerDay) break;
        const { op, assessment, money } = candidate;
        const adapter = op.adapter;

        if (PROPOSAL_SOURCES.has(op.source)) {
          try {
            const claim = await adapter.claim(this.env, op);
            if (!claim?.ok) {
              await this.markSeen(op, 'proposal_skipped', { reason: claim?.reason || 'proposal failed' }, RETRY_TTL_MS);
              continue;
            }
            await this.markSeen(op, 'proposal_sent', { proposedUsd: claim.proposedUsd, money, assessment });
            await this.log('proposal_sent', { source: op.source, id: op.id, proposedUsd: claim.proposedUsd, expectedNetUsd: money.net, score: money.score });
            summary.taken.push({ source: op.source, id: op.id, action: 'proposal', proposedUsd: claim.proposedUsd, score: money.score });
            newJobs += 1;
          } catch (e) {
            await this.markSeen(op, 'proposal_error', { error: safeError(e) }, RETRY_TTL_MS);
            await this.log('proposal_error', { source: op.source, id: op.id, error: safeError(e) });
          }
          continue;
        }

        let claim;
        try {
          claim = await adapter.claim(this.env, op);
          if (!claim?.ok) {
            await this.markSeen(op, 'claim_skipped', { reason: claim?.reason || 'claim failed' }, RETRY_TTL_MS);
            continue;
          }
        } catch (e) {
          await this.markSeen(op, 'claim_error', { error: safeError(e) }, RETRY_TTL_MS);
          await this.log('claim_error', { source: op.source, id: op.id, error: safeError(e) });
          continue;
        }

        let work;
        try {
          work = await executeWork(this.env, op);
          await this.incCounter('ai_jobs');
        } catch (e) {
          await this.markSeen(op, 'work_error', { error: safeError(e) }, RETRY_TTL_MS);
          await this.log('work_error', { source: op.source, id: op.id, error: safeError(e) });
          continue;
        }
        if (!work?.success) {
          await this.markSeen(op, 'work_failed', { notes: work?.notes }, RETRY_TTL_MS);
          continue;
        }

        try {
          const submission = await adapter.submit(this.env, op, claim, work);
          if (submission?.skipped) {
            await this.markSeen(op, 'submission_skipped', { reason: submission.reason }, RETRY_TTL_MS);
            continue;
          }
          await this.markSeen(op, 'submitted', { money, assessment, submission });
          await this.log('submitted', { source: op.source, id: op.id, grossUsd: op.grossUsd, netUsd: money.net, score: money.score });
          summary.taken.push({ source: op.source, id: op.id, action: 'claimed_submitted', netUsd: money.net, score: money.score });
          newJobs += 1;
        } catch (e) {
          await this.markSeen(op, 'submission_error', { error: safeError(e) }, RETRY_TTL_MS);
          await this.log('submission_error', { source: op.source, id: op.id, error: safeError(e) });
        }
      }

      let payouts = null;
      try {
        payouts = await sweepPayouts(this.env);
        await this.log('payout_sweep', payouts);
      } catch (e) {
        payouts = { enabled: true, error: safeError(e) };
        await this.log('payout_sweep_error', { error: safeError(e) });
      }
      const finished = nowIso();
      const final = { ...summary, payouts, finished, ai: { assessmentsToday: await this.getCounter('ai_assessments'), jobsToday: await this.getCounter('ai_jobs') } };
      await this.state.storage.put('run:last', final);
      await this.log('cycle_complete', { started, finished, taken: summary.taken.length, evaluated: summary.evaluated });
      return final;
    } finally {
      await this.state.storage.delete('run:started_at');
    }
  }

  async status() {
    return {
      ok: true,
      mode: this.env.RUN_MODE || 'live',
      moneyRules: MONEY,
      payouts: payoutStatus(this.env),
      connectors: this.connectorState(),
      ai: { model: this.env.AI_MODEL, assessmentsToday: await this.getCounter('ai_assessments'), jobsToday: await this.getCounter('ai_jobs') },
      lastRun: await this.state.storage.get('run:last') || null,
      discoveryOnly: await this.state.storage.get('discovery_only') || null,
      catalog: await this.state.storage.get('catalog:last') || null,
      events: await this.events(30)
    };
  }
}
