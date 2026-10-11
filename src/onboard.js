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
  const storageKey = 'credential:agenthansa';

  const saved = await storage.get(storageKey);

  if (saved?.apiKey) {
    try {
      await fetchJson(`${HANSA_BASE}/api/agents/me`, {
        headers: jsonHeaders(saved.apiKey)
      });

      return {
        source: 'agenthansa',
        status: 'already_registered'
      };
    } catch (e) {
      if (e.status !== 401 && e.status !== 403) throw e;
      await storage.delete(storageKey);
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
          'Autonomous research, writing, data analysis and structured digital task agent.',
        callback_url:
          env.PUBLIC_BASE_URL ||
          'https://money-agent.dctmvsaf1998.workers.dev'
      })
    }
  );

  const apiKey =
    registration?.api_key ||
    registration?.apiKey;

  if (apiKey) {
    await storage.put(storageKey, {
      apiKey,
      createdAt: new Date().toISOString()
    });

    return {
      source: 'agenthansa',
      status: 'registered',
      payoutSetup: 'pending'
    };
  }

  const question =
  registration?.question ||
  registration?.challenge;

const challengeId =
  registration?.challenge_id ||
  registration?.challengeId;

if (question && challengeId && env.AI) {
  const aiReply = await env.AI.run(
    env.AI_MODEL || '@cf/zai-org/glm-4.7-flash',
    {
      messages: [
        {
          role: 'system',
          content:
            'Solve the arithmetic registration question. Return ONLY the integer answer.'
        },
        {
          role: 'user',
          content: String(question)
        }
      ],
      max_tokens: 20,
      temperature: 0
    }
  );

  const raw =
    aiReply?.response ||
    aiReply?.result?.response ||
    aiReply?.text ||
    '';

  const match = String(raw).match(/-?\d+/);

  if (!match) {
    throw new Error(
      `Could not solve AgentHansa challenge: ${question}`
    );
  }

  const verified = await fetchJson(
    `${HANSA_BASE}/api/agents/register`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: env.AGENT_NAME || 'Onigiri Money Agent',
        description:
          'Autonomous research, writing, data analysis and structured digital task agent.',
        callback_url:
          env.PUBLIC_BASE_URL ||
          'https://money-agent.dctmvsaf1998.workers.dev',
        challenge_id: challengeId,
        challenge_answer: Number(match[0])
      })
    }
  );

  const verifiedApiKey =
    verified?.api_key ||
    verified?.apiKey;

  if (verifiedApiKey) {
    await storage.put(storageKey, {
      apiKey: verifiedApiKey,
      createdAt: new Date().toISOString()
    });

    return {
      source: 'agenthansa',
      status: 'registered',
      payoutSetup: 'email_verification_required'
    };
  }
}

return {
  source: 'agenthansa',
  status: 'verification_required',
  challengeId: challengeId || null,
  challenge: question || null
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
