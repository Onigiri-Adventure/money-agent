export function n(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

export function parseUsdc(value) {
  if (value == null) return 0;
  const x = Number(value);
  if (!Number.isFinite(x)) return 0;
  // TaskMarket REST uses six-decimal base-unit strings for rewards.
  if (Number.isInteger(x) && x >= 100000) return x / 1_000_000;
  return x;
}

export function asArray(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.jobs)) return payload.data.jobs;
  return [];
}

export async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    const text = await r.text();
    let body = null;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { text }; }
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status} ${url}: ${String(text).slice(0, 400)}`);
      err.status = r.status;
      err.body = body;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export function jsonHeaders(token) {
  const h = { 'content-type': 'application/json', 'accept': 'application/json' };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

export function textOf(...parts) {
  return parts.filter(Boolean).map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n').trim();
}

export function stripFences(s) {
  const t = String(s ?? '').trim();
  return t.replace(/^```(?:json|javascript|text)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export function parseLooseJson(s, fallback = null) {
  if (typeof s === 'object' && s !== null) return s;
  const t = stripFences(s);
  try { return JSON.parse(t); } catch {}
  const first = t.indexOf('{'), last = t.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(t.slice(first, last + 1)); } catch {}
  }
  return fallback;
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function base64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(x => {
    const k = keyFn(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function netFrom(gross, feeBps = 0) {
  return Math.max(0, n(gross) * (1 - n(feeBps) / 10000));
}

export function opportunityId(op) {
  return `${op.source}:${op.id}`;
}

export function nowIso() { return new Date().toISOString(); }

export function safeUrlCandidate(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h === '127.0.0.1' || h === '0.0.0.0' || h === '169.254.169.254') return null;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return null;
    return u.toString();
  } catch { return null; }
}

export function extractHttpsUrls(text, limit = 3) {
  const matches = String(text || '').match(/https:\/\/[^\s<>"')\]]+/g) || [];
  const out = [];
  for (const m of matches) {
    const u = safeUrlCandidate(m.replace(/[.,;:!?]+$/, ''));
    if (u && !out.includes(u)) out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}
