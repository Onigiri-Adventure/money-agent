import { asArray, fetchJson, jsonHeaders, textOf } from '../utils.js';

const BASE = 'https://superteam.fun';

function auth(env) {
  return jsonHeaders(env.SUPERTEAM_AGENT_API_KEY);
}

function unwrapListing(data) {
  return data?.listing || data?.data?.listing || data?.data || data || {};
}

function liveListings(data) {
  if (Array.isArray(data?.data?.listings)) return data.data.listings;
  return asArray(data, ['listings', 'items']);
}

function moneyValue(v) {
  if (v == null) return 0;

  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : 0;
  }

  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

function rewardUsd(listing) {
  const values = [];

  const scalars = [
    listing.reward,
    listing.rewardAmount,
    listing.totalReward,
    listing.totalRewardAmount,
    listing.bountyAmount,
    listing.compensation,
    listing.maxRewardAsk,
    listing.minRewardAsk
  ];

  for (const x of scalars) {
    const n = moneyValue(x);
    if (n > 0) values.push(n);
  }

  const arrays = [
    listing.rewards,
    listing.prizes,
    listing.rewardTiers
  ];

  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;

    for (const item of arr) {
      if (typeof item === 'number' || typeof item === 'string') {
        const n = moneyValue(item);
        if (n > 0) values.push(n);
        continue;
      }

      const n = moneyValue(
        item?.amount ??
        item?.reward ??
        item?.value ??
        item?.prize ??
        item?.usd
      );

      if (n > 0) values.push(n);
    }
  }

  return values.length ? Math.max(...values) : 0;
}

function eligibilityQuestions(listing) {
  const raw =
    listing.eligibility ??
    listing.eligibilityQuestions ??
    listing.questions ??
    [];

  if (!Array.isArray(raw)) return [];

  return raw.map(q => {
    if (typeof q === 'string') return q;

    return (
      q?.question ??
      q?.label ??
      q?.title ??
      q?.name ??
      ''
    );
  }).filter(Boolean);
}

function listingType(listing) {
  return String(
    listing.type ??
    listing.listingType ??
    listing.opportunityType ??
    ''
  ).toLowerCase();
}

function buildEligibilityAnswers(requiredQuestions, supplied) {
  if (!requiredQuestions.length) return [];

  const items = Array.isArray(supplied) ? supplied : [];

  return requiredQuestions.map(question => {
    const match = items.find(x =>
      String(x?.question || '').trim().toLowerCase() ===
      String(question).trim().toLowerCase()
    );

    return {
      question,
      answer: String(match?.answer || '').trim()
    };
  });
}

export const superteam = {
  id: 'superteam_earn',
  name: 'Superteam Earn',
  feeBps: 0,

  canExecute(env) {
    return Boolean(env.SUPERTEAM_AGENT_API_KEY);
  },

  async list(env) {
    const data = await fetchJson(
      `${BASE}/api/agents/listings/live?take=50`,
      { headers: auth(env) }
    );

    const live = liveListings(data);
    const opportunities = [];

    for (const item of live) {
      const slug =
        item.slug ??
        item.listingSlug ??
        item.urlSlug ??
        item.id;

      if (!slug) continue;

      let detail;

      try {
        const response = await fetchJson(
          `${BASE}/api/agents/listings/details/${encodeURIComponent(slug)}`,
          { headers: auth(env) }
        );

        detail = unwrapListing(response);
      } catch {
        continue;
      }

      const access = String(detail.agentAccess || '').toUpperCase();

      if (
        access &&
        access !== 'AGENT_ALLOWED' &&
        access !== 'AGENT_ONLY'
      ) {
        continue;
      }

      const type = listingType(detail || item);

      if (type === 'project' && !env.SUPERTEAM_TELEGRAM_URL) {
        continue;
      }

      const listingId = String(
        detail.id ??
        detail.listingId ??
        item.id ??
        ''
      );

      if (!listingId) continue;

      const questions = eligibilityQuestions(detail);

      const compensationType = String(
        detail.compensationType || ''
      ).toLowerCase();

      const gross = rewardUsd(detail);

      if (!(gross > 0)) continue;

      const submissionInstructions = `
AUTONOMOUS SUPERTEAM SUBMISSION REQUIREMENT:

Your deliverable_json MUST contain:

{
  "otherInfo": "complete final submission text",
  "link": "",
  "tweet": "",
  "eligibilityAnswers": [
    {
      "question": "exact eligibility question",
      "answer": "complete truthful answer"
    }
  ],
  "ask": null
}

Rules:
1. Answer every eligibility question truthfully.
2. Never invent a project URL, social post, credential, experience, test result or completed external action.
3. If no external URL is genuinely available, leave "link" empty and provide a detailed "otherInfo".
4. If compensationType is RANGE or VARIABLE, provide a reasonable numeric "ask".
5. Do not copy or imitate other applicants.
`.trim();

      opportunities.push({
        source: 'superteam_earn',
        id: listingId,
        listingId,
        slug,

        title:
          detail.title ||
          detail.name ||
          item.title ||
          `Superteam ${listingId}`,

        description: textOf(
          detail.description,
          detail.scope,
          detail.requirements,
          detail.deliverables,
          submissionInstructions
        ),

        requirements: {
          eligibilityQuestions: questions,
          compensationType,
          skills: detail.skills || [],
          deadline: detail.deadline || null,
          type
        },

        category: 'other',
        grossUsd: gross,
        netUsd: gross,
        feeBps: 0,
        exclusive: false,
        requiresSpend: false,
        autoCategoryStrict: false,

        listingType: type,
        eligibilityQuestions: questions,
        compensationType,

        raw: detail
      });
    }

    return opportunities;
  },

  async claim(env, op) {
    return {
      ok: true,
      listingId: op.listingId || op.id
    };
  },

  async submit(env, op, claim, work) {
    const generated =
      work.deliverable_json &&
      typeof work.deliverable_json === 'object'
        ? work.deliverable_json
        : {};

    const questions = op.eligibilityQuestions || [];

    const answers = buildEligibilityAnswers(
      questions,
      generated.eligibilityAnswers
    );

    const missingAnswer = answers.find(x => !x.answer);

    if (missingAnswer) {
      return {
        skipped: true,
        reason: `Superteam eligibility answer missing: ${missingAnswer.question}`
      };
    }

    const compensationType = String(
      op.compensationType || ''
    ).toLowerCase();

    let ask = generated.ask ?? null;

    if (
      (compensationType === 'range' ||
       compensationType === 'variable') &&
      !(Number(ask) > 0)
    ) {
      return {
        skipped: true,
        reason: 'Superteam listing requires a compensation ask but the Worker did not produce one.'
      };
    }

    if (ask != null) {
      ask = Number(ask);
    }

    const telegram =
      String(
        env.SUPERTEAM_TELEGRAM_URL ||
        generated.telegram ||
        ''
      ).trim();

    if (
      op.listingType === 'project' &&
      !/^https?:\/\/t\.me\/[^/]+\/?$/i.test(telegram)
    ) {
      return {
        skipped: true,
        reason: 'Superteam project requires SUPERTEAM_TELEGRAM_URL.'
      };
    }

    const otherInfo = String(
      generated.otherInfo ||
      work.deliverable_text ||
      ''
    ).trim();

    if (!otherInfo) {
      return {
        skipped: true,
        reason: 'Superteam submission has no usable otherInfo.'
      };
    }

    const payload = {
      listingId: op.listingId || op.id,
      link: String(generated.link || '').trim(),
      tweet: String(generated.tweet || '').trim(),
      otherInfo,
      eligibilityAnswers: answers,
      ask,
      telegram: telegram || undefined
    };

    return fetchJson(
      `${BASE}/api/agents/submissions/create`,
      {
        method: 'POST',
        headers: auth(env),
        body: JSON.stringify(payload)
      }
    );
  }
};
