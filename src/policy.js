import { MONEY, SAFE_CATEGORIES } from './config.js';
import { n, netFrom, textOf } from './utils.js';

const spendPatterns = [
  /\b(deposit|stake|collateral|bond)\b/i,
  /\b(pay|purchase|buy|subscribe|subscription|fund)\b.{0,28}\b(usdc|usd|eth|sol|token|credit|fee|gas|wallet|product|service)\b/i,
  /\b(gas fee|network fee|paid api|paid tool|bid credit|entry fee|verification fee)\b/i,
  /\bcreate (?:and )?fund(?:ed|ing)?\b/i,
  /\bhire (?:another|other) agent\b/i,
  /\bsend (?:money|funds|crypto|usdc|eth|sol)\b/i
];

const disallowedTaskPatterns = [
  /\bfake (review|rating|testimonial|engagement|click|view)\b/i,
  /\b(review bombing|astroturf|sockpuppet)\b/i,
  /\b(captcha|recaptcha)\b/i,
  /\bimpersonat(e|ion)\b/i,
  /\bphish(ing)?\b/i,
  /\bcredential stuffing\b/i,
  /\bmalware|ransomware|keylogger|stealer|botnet|ddos\b/i,
  /\bbypass (?:kyc|2fa|mfa|security|access controls?)\b/i,
  /\bexploit (?:a|the|this) (?:site|server|account|wallet|system)\b/i,
  /\bwrite.*(?:positive|five[- ]star|5[- ]star).*review\b/i,
  /\bcomplete.*survey.*(?:as|pretend|persona|human)\b/i,
  /\bidentity verification|upload.*(?:passport|id card|selfie)\b/i
];

const securityPatterns = [
  /\bbug bounty\b/i, /\bvulnerability\b/i, /\bpenetration test\b/i, /\bexploit\b/i,
  /\bsecurity audit\b/i, /\bsmart contract audit\b/i
];

export function hardPolicyCheck(op) {
  const text = textOf(op.title, op.description, op.requirements, op.raw?.spec).slice(0, 30000);
  if (op.requiresSpend === true) return { ok: false, reason: 'source says worker spending is required' };
  if (n(op.depositUsd) > 0 || n(op.stakeUsd) > 0 || n(op.workerFeeUsd) > 0) return { ok: false, reason: 'deposit/stake/worker fee > $0' };
  if (spendPatterns.some(r => r.test(text))) return { ok: false, reason: 'task text appears to require spending/funding' };
  if (disallowedTaskPatterns.some(r => r.test(text))) return { ok: false, reason: 'task conflicts with safety/integrity policy' };
  if (securityPatterns.some(r => r.test(text)) || op.category === 'security') return { ok: false, reason: 'security work is discovery-only, never generic auto-execution' };
  if (op.category && !SAFE_CATEGORIES.has(String(op.category).toLowerCase()) && op.autoCategoryStrict) {
    return { ok: false, reason: `unsupported autonomous category: ${op.category}` };
  }
  return { ok: true };
}

export function computeNet(op) {
  if (n(op.netUsd) > 0) return n(op.netUsd);
  return netFrom(op.grossUsd, op.feeBps || 0);
}

export function moneyCheck(op, assessment) {
  const net = computeNet(op);
  const confidence = Math.max(0, Math.min(1, n(assessment?.confidence)));
  const minutes = Math.max(1, n(assessment?.estimated_minutes, 999));
  const hourly = net / (minutes / 60);
  if (net < MONEY.hardMinNet) return { ok: false, net, hourly, reason: `net $${net.toFixed(2)} below $${MONEY.hardMinNet} floor` };
  const tier = MONEY.tiers.find(t => net >= t.min && net < t.max);
  if (!tier) return { ok: false, net, hourly, reason: 'no money tier matched' };
  if (minutes > tier.maxMinutes) return { ok: false, net, hourly, reason: `too slow: ${minutes}m for this payout tier` };
  if (confidence < tier.minConfidence) return { ok: false, net, hourly, reason: `confidence ${(confidence*100).toFixed(0)}% too low` };
  if (hourly < tier.minHourly) return { ok: false, net, hourly, reason: `implied $${hourly.toFixed(2)}/h too low` };
  const ev = net * confidence;
  const speedBonus = Math.min(2, 20 / minutes);
  return { ok: true, net, hourly, ev, score: ev * speedBonus, tier };
}
