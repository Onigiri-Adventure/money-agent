import { asArray, base64Utf8, fetchJson, jsonHeaders, parseUsdc, textOf } from '../utils.js';
import { signEip191, evmAccount } from '../wallet.js';

const BASE = 'https://api.taskmarket.dev';

function noDeposit(t) {
  const vals = [t.stakeRequired, t.stakeBps, t.deposit, t.depositAmount, t.requiredDeposit, t.claimDeposit];
  return vals.every(v => v == null || v === false || Number(v) === 0);
}

export const taskmarket = {
  id: 'taskmarket', name: 'Daydreams TaskMarket', feeBps: 750,
  canExecute(env) { return Boolean(env.EVM_PRIVATE_KEY); },
  async list() {
    const data = await fetchJson(`${BASE}/api/tasks?status=open&limit=100&sort=newest`);
    const tasks = asArray(data, ['tasks', 'items']);
    return tasks.filter(t => String(t.mode || '').toLowerCase() === 'claim' && noDeposit(t)).map(t => {
      const gross = parseUsdc(t.reward ?? t.grossReward ?? 0);
      const net = parseUsdc(t.netReward ?? 0) || gross * 0.925;
      return {
        source: 'taskmarket', id: String(t.id || t.taskId), title: t.title || `TaskMarket ${t.id || ''}`,
        description: textOf(t.description, t.instructions), requirements: t.requirements || {}, category: (t.tags?.[0] || 'other').toLowerCase(),
        grossUsd: gross, netUsd: net, feeBps: 750, exclusive: true, requiresSpend: false,
        depositUsd: 0, autoCategoryStrict: false, raw: t
      };
    });
  },
  async claim(env, op) {
    const account = evmAccount(env);
    const { signature } = await signEip191(env, `taskmarket:claim:${op.id}`);
    try {
      const data = await fetchJson(`${BASE}/api/tasks/${encodeURIComponent(op.id)}/claim`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ taskId: op.id, workerAddress: account.address, signature })
      });
      return { ok: true, address: account.address, data };
    } catch (e) {
      if (e.status === 402) return { ok: false, reason: 'claim unexpectedly requested payment; skipped' };
      throw e;
    }
  },
  async submit(env, op, claim, work) {
    const { signature } = await signEip191(env, `taskmarket:submit:${op.id}`);
    const isJson = work.deliverable_json && typeof work.deliverable_json === 'object';
    const content = isJson ? JSON.stringify(work.deliverable_json, null, 2) : work.deliverable_text;
    const artifact = {
      fileName: isJson ? 'result.json' : 'result.txt', mimeType: isJson ? 'application/json' : 'text/plain', role: 'final', file: base64Utf8(content)
    };
    try {
      return await fetchJson(`${BASE}/api/tasks/${encodeURIComponent(op.id)}/submissions`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ taskId: op.id, workerAddress: claim.address, artifacts: [artifact], signature })
      });
    } catch (e) {
      if (e.status === 402) return { skipped: true, reason: 'free submission allowance unavailable; bot refuses paid X402 submission' };
      throw e;
    }
  }
};
