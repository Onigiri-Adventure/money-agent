import { extractHttpsUrls } from './utils.js';
import { produceWork } from './ai.js';

async function fetchPublicContext(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'MoneyAgent/1.0 (+public research worker)' }, redirect: 'follow' });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || (!ct.includes('text') && !ct.includes('json') && !ct.includes('xml'))) return null;
    const text = (await r.text()).replace(/\0/g, '').slice(0, 12000);
    return { url, status: r.status, content_type: ct, text };
  } catch { return null; }
}

export async function executeWork(env, op) {
  const urls = extractHttpsUrls(`${op.description || ''}\n${JSON.stringify(op.requirements || '')}`, 3);
  const context = [];
  for (const url of urls) {
    const x = await fetchPublicContext(url);
    if (x) context.push(x);
  }
  return produceWork(env, op, context);
}
