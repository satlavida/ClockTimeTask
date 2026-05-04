import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types.js';
import sessions from './routes/sessions.js';
import sync from './routes/sync.js';
import shareCodes from './routes/shareCodes.js';

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('/api/*', cors({
  origin: [
    'http://localhost:3000',
    'https://clocktask.pages.dev',
    'https://clocktask.satyajeetnigade.in',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/api/health', (c) =>
  c.json({ ok: true, env: c.env.ENVIRONMENT, ts: new Date().toISOString() })
);

app.route('/api/sessions', sessions);
app.route('/api/sessions', sync);
app.route('/api/sessions', shareCodes);

export default app;
