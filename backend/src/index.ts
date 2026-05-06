import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types.js';
import sessions from './routes/sessions.js';
import { getMeta, putMeta } from './lib/kv.js';

export { SessionDO } from './SessionDO.js';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://clocktask.pages.dev',
  'https://clocktask.satyajeetnigade.in',
];

// Hono handles non-session routes (health, session creation)
const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('/api/*', cors({
  origin: ALLOWED_ORIGINS,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/api/health', (c) =>
  c.json({ ok: true, env: c.env.ENVIRONMENT, ts: new Date().toISOString() })
);

app.route('/api/sessions', sessions);

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight for DO routes
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin') ?? '';
      if (ALLOWED_ORIGINS.includes(origin)) {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
          },
        });
      }
      return new Response(null, { status: 204 });
    }

    // Route /api/sessions/:id/* to the Durable Object
    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([A-Za-z0-9]+)(\/|$)/);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId));
      const resp = await stub.fetch(request);

      // WS upgrade responses pass through as-is (can't be wrapped)
      if (resp.status === 101) return resp;

      // After session deletion, decrement meta count
      const isSessionDelete = /^\/api\/sessions\/[A-Za-z0-9]+\/?$/.test(url.pathname) && request.method === 'DELETE';
      if (isSessionDelete && resp.status === 204) {
        const decrement = async () => {
          const meta = await getMeta(env.SESSIONS);
          await putMeta(env.SESSIONS, { ...meta, sessionCount: Math.max(0, meta.sessionCount - 1) });
        };
        if (ctx) ctx.waitUntil(decrement());
        else await decrement();
      }

      // Add CORS headers
      const origin = request.headers.get('Origin') ?? '';
      if (ALLOWED_ORIGINS.includes(origin)) {
        const newResp = new Response(resp.body, resp);
        newResp.headers.set('Access-Control-Allow-Origin', origin);
        newResp.headers.set('Vary', 'Origin');
        newResp.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        newResp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return newResp;
      }
      return resp;
    }

    return app.fetch(request, env, ctx);
  },
};
