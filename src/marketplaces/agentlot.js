import { fetchJson } from '../utils.js';
import { HARD_SOURCE_BLOCKS, DIRECT_SOURCE_IDS } from '../config.js';

const URL = 'https://agentlot.io/api/v1/earning-sources';

export async function getAgentLotSources() {
  const data = await fetchJson(URL, {}, 12000);
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  return sources.map(s => {
    const strictBlocked = HARD_SOURCE_BLOCKS.has(s.source_id) || s.zero_spend_start !== true;
    return {
      ...s,
      strict_zero_cost_eligible: !strictBlocked,
      direct_connector: DIRECT_SOURCE_IDS.has(s.source_id),
      blocked_reason: HARD_SOURCE_BLOCKS.get(s.source_id) || (s.zero_spend_start === true ? null : 'catalog says zero_spend_start=false')
    };
  });
}

export async function agentLotSummary() {
  const sources = await getAgentLotSources();
  return {
    total_catalogued: sources.length,
    zero_spend_catalogued: sources.filter(s => s.zero_spend_start === true).length,
    strict_zero_cost_after_overrides: sources.filter(s => s.strict_zero_cost_eligible).length,
    direct_connectors: sources.filter(s => s.direct_connector && s.strict_zero_cost_eligible).map(s => s.source_id),
    blocked_overrides: sources.filter(s => s.blocked_reason).map(s => ({ source_id: s.source_id, reason: s.blocked_reason })),
    sources
  };
}
