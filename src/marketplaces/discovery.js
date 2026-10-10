import { asArray, fetchJson, textOf } from '../utils.js';

export const discoveryOnly = [
  {
    id: 't2000', name: 't2000 Open Jobs',
    async list() {
      const data = await fetchJson('https://api.t2000.ai/v1/open-jobs?status=open&limit=100&offset=0').catch(() => ({}));
      return asArray(data, ['jobs', 'items']).map(j => ({ source: 't2000', id: String(j.id || j.job_id), title: j.title, description: textOf(j.description, j.requirements), grossUsd: Number(j.budget_usdc || j.price_usdc || j.budget || 0), raw: j }));
    }
  },
  {
    id: 'taskbounty', name: 'TaskBounty',
    async list(env) {
      const headers = env.TASKBOUNTY_API_KEY ? { authorization: `Bearer ${env.TASKBOUNTY_API_KEY}` } : {};
      const data = await fetchJson('https://www.task-bounty.com/api/v1/tasks?state=open&limit=100', { headers }).catch(() => ({}));
      return asArray(data, ['tasks']).map(j => ({ source: 'taskbounty', id: String(j.id), title: j.title, description: textOf(j.description, j.github_issue_url), grossUsd: Number(j.bounty_cents ? j.bounty_cents / 100 : j.bounty || 0), raw: j }));
    }
  },
  {
    id: 'frantic', name: 'Frantic',
    async list() {
      const data = await fetchJson('https://gofrantic.com/v1/board').catch(() => ({}));
      return asArray(data, ['bounties', 'jobs', 'items', 'opens']).map(j => ({ source: 'frantic', id: String(j.id || j.bounty || j.number), title: j.title, description: textOf(j.description, j.task), grossUsd: Number(j.price_usd || j.reward_usdc || j.budget || 0), raw: j }));
    }
  }
];
