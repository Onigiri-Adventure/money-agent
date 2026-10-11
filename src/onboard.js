import { fetchJson, jsonHeaders } from './utils.js';
import { evmAccount, signEip191 } from './wallet.js';

const AGENTSBAY_BASE = 'https://agentsbay.ai/api/v1';
const HANSA_BASE = 'https://www.agenthansa.com';

async function onboardAgentsBay(env) {
  if (!env.EVM_PRIVATE_KEY || !env.PAYOUT_EVM_ADDRESS) {
    return {
      source: 'agentsbay',
      status: 'missing_wallet'
    };
  }

  const account = evmAccount(env);

  try {
    const profile = await fetchJson(
      `${AGENTSBAY_BASE}/agent/${account.address}`
    );

    if (profile) {
      return {
        source: 'agentsbay',
        status: 'already_registered',
        address: account.address
      };
    }
  } catch (e) {
    if (e.status && e.status !== 404) throw e;
  }

  const publicBaseUrl =
    env.PUBLIC_BASE_URL ||
    'https://money-agent.dctmvsaf1998.workers.dev';

  const registration = await fetchJson(
    `${AGENTSBAY_BASE}/register`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        wallet: account.address,
        name: env.AGENT_NAME || 'Onigiri Money Agent',
        endpoint: `${publicBaseUrl.replace(/\/$/, '')}/agentsbay`,
        capabilities: [
          'research',
          'writing',
          'data_analysis'
        ],
        pricing: {
          research: '10 USDC',
          writing: '10 USDC',
          data_analysis: '15 USDC'
        },
        axl_support: false
      })
    }
  );

  const challenge =
    registration?.challenge ||
    registration?.nonce;

  if (!challenge) {
    throw new Error(
      'AgentsBay registration challenge missing'
    );
  }

  const { signature } =
    await signEip191(env, challenge);

  await fetchJson(
    `${AGENTSBAY_BASE}/register/verify`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        wallet: account.address,
        signature
      })
    }
  );

  return {
    source: 'agentsbay',
    status: 'registered',
    address: account.address
  };
}

async function onboardAgentHansa(env, storage) {
  if (!env.PAYOUT_SOLANA_ADDRESS) {
    return {
      source: 'agenthansa',
      status: 'missing_solana_wallet'
    };
  }

  const storageKey = 'credential:agenthansa';

  let saved = await storage.get(storageKey);

  if (saved?.apiKey) {
    try {
      const me = await fetchJson(
        `${HANSA_BASE}/api/agents/me`,
        {
          headers: jsonHeaders(saved.apiKey)
        }
      );

      return {
        source: 'agenthansa',
        status: 'already_registered',
        id: saved.id || me?.id || null
      };
    } catch (e) {
      if (e.status !== 401 && e.status !== 403) {
        throw e;
      }

      await storage.delete(storageKey);
      saved = null;
    }
  }

  const registration = await fetchJson(
    `${HANSA_BASE}/api/agents/register`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: env.AGENT_NAME || 'Onigiri Money Agent',
        description:
          'Autonomous research, writing, data analysis and structured digital task agent.'
      })
    }
  );

  const apiKey =
    registration?.api_key ||
    registration?.apiKey;

  if (!apiKey) {
    throw new Error(
      'AgentHansa did not return an API key'
    );
  }

  await fetchJson(
    `${HANSA_BASE}/api/agents/wallet`,
    {
      method: 'PUT',
      headers: jsonHeaders(apiKey),
      body: JSON.stringify({
        wallet_address: env.PAYOUT_SOLANA_ADDRESS
      })
    }
  );

  await storage.put(storageKey, {
    id: registration?.id || null,
    apiKey,
    payoutWallet: env.PAYOUT_SOLANA_ADDRESS,
    createdAt: new Date().toISOString()
  });

  return {
    source: 'agenthansa',
    status: 'registered',
    id: registration?.id || null
  };
}

export async function bulkOnboard(env, storage) {
  const results = [];

  results.push({
    source: 'bountybook',
    status:
      env.EVM_PRIVATE_KEY && env.PAYOUT_EVM_ADDRESS
        ? 'already_ready'
        : 'missing_wallet'
  });

  results.push({
    source: 'taskmarket',
    status:
      env.EVM_PRIVATE_KEY && env.PAYOUT_EVM_ADDRESS
        ? 'already_ready'
        : 'missing_wallet'
  });

  try {
    results.push(await onboardAgentsBay(env));
  } catch (e) {
    results.push({
      source: 'agentsbay',
      status: 'error',
      error: String(e?.message || e)
    });
  }

  try {
    results.push(
      await onboardAgentHansa(env, storage)
    );
  } catch (e) {
    results.push({
      source: 'agenthansa',
      status: 'error',
      error: String(e?.message || e)
    });
  }

  if (env.SUPERTEAM_AGENT_API_KEY) {
    results.push({
      source: 'superteam_earn',
      status: 'already_registered',
      note: 'Human claim step may still be required only if a payout is won.'
    });
  }

  return {
    ok: true,
    zeroOutOfPocket: true,
    results,
    excluded: [
      {
        source: 'basedagents',
        reason: 'Skipped by owner'
      },
      {
        source: 'moltjobs',
        reason: 'Mandatory certification fee'
      },
      {
        source: 'clawgig',
        reason: 'Current deployment unavailable'
      },
      {
        source: 'workprotocol',
        reason: 'Current registration route unavailable'
      },
      {
        source: 'agentbazaar',
        reason: 'Skipped by owner'
      }
    ]
  };
}
