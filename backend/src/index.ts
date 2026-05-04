import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

type Env = { ENVIRONMENT: string };

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('/api/*', cors({
  origin: [
    'http://localhost:3000',
    'https://clocktask.pages.dev',
    'https://clocktask.satyajeetnigade.in',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

app.get('/api/health', (c) =>
  c.json({ ok: true, env: c.env.ENVIRONMENT, ts: new Date().toISOString() })
);

// TODO: add routes here

export default app;
