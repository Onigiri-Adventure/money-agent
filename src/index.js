import { MoneyAgent } from './agent.js';
import { agentLotSummary } from './marketplaces/agentlot.js';
import { payoutStatus } from './payouts.js';
export { MoneyAgent };

function agentStub(env) {
  return env.MONEY_AGENT.get(env.MONEY_AGENT.idFromName('singleton'));
}

function authorized(request, env) {
  if (!env.ADMIN_KEY) return false;
  const u = new URL(request.url);
  const bearer = request.headers.get('authorization') || '';
  return u.searchParams.get('key') === env.ADMIN_KEY || bearer === `Bearer ${env.ADMIN_KEY}`;
}

export default {
  async scheduled(controller, env, ctx) {
    const req = new Request('https://money-agent.internal/run', { method: 'POST' });
    ctx.waitUntil(agentStub(env).fetch(req));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'money-agent',
        zero_out_of_pocket: true,
        schedule: 'every 15 minutes',
        endpoints: ['/status', '/sources', '/payouts', '/events', '/run (admin)']
      });
    }

    if (url.pathname === '/status') return agentStub(env).fetch(new Request('https://money-agent.internal/status'));
    if (url.pathname === '/events') return agentStub(env).fetch(new Request('https://money-agent.internal/events'));
    if (url.pathname === '/payouts') return Response.json(payoutStatus(env));

    if (url.pathname === '/sources') {
      try { return Response.json(await agentLotSummary()); }
      catch (e) { return Response.json({ ok: false, error: String(e?.message || e) }, { status: 502 }); }
    }

    if (url.pathname === '/onboard') {
  if (!authorized(request, env)) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  return agentStub(env).fetch(
    new Request('https://money-agent.internal/onboard', {
      method: 'POST'
    })
  );
}
    if (url.pathname === '/run') {
      if (!authorized(request, env)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      return agentStub(env).fetch(new Request('https://money-agent.internal/run', { method: 'POST' }));
    }


    return Response.json({ ok: false, error: 'not found' }, { status: 404 });
  }
};
