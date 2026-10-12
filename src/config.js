export const MONEY = {
  hardMinNet: 5,
  preferredNet: 10,
  highValueNet: 25,
  maxNewJobsPerCycle: 2,
  maxAIAssessmentsPerCycle: 6,
  maxAIAssessmentsPerDay: 18,
  maxAIJobsPerDay: 8,
  tiers: [
    { min: 5, max: 10, maxMinutes: 10, minConfidence: 0.90, minHourly: 24 },
    { min: 10, max: 25, maxMinutes: 30, minConfidence: 0.82, minHourly: 18 },
    { min: 25, max: Infinity, maxMinutes: 60, minConfidence: 0.75, minHourly: 15 }
  ]
};

export const SAFE_CATEGORIES = new Set([
  'research', 'content', 'writing', 'data', 'data_analysis', 'translation',
  'summarization', 'classification', 'marketing', 'custom', 'workflow',
  'transform', 'fetch', 'scrape'
]);

export const DIRECT_SOURCE_IDS = new Set([
  'basedagents', 'bountybook', 'taskmarket','superteam_earn', 'agentsbay', 'workprotocol', 'clawgig', 'moltjobs', 'agentbazaar'
]);

export const HARD_SOURCE_BLOCKS = new Map([
  ['clawlancer', 'Current worker path can require worker-funded ETH gas.'],
  ['taskforce', 'Withdrawal gas is not fully sponsored under the strict zero-cost rule.'],
  ['clustly', 'Worker collateral/stake can apply.'],
  ['claw_earn', 'Worker collateral is required.'],
  ['agoragentic', 'Seller stake is required.']
]);

export const DEFAULT_CAPABILITIES = ['research', 'writing', 'data_analysis', 'content'];
