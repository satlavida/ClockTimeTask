import { Hono } from 'hono';
import type { Env, Permission } from '../types.js';
import { getMeta, putMeta } from '../lib/kv.js';
import { emptyState } from '../lib/crdt.js';
import { randomAlphanumeric } from '../lib/auth.js';

const SESSION_LIMIT = 50;
const ALL_PERMISSIONS: Permission[] = [
  'view_tasks', 'edit_tasks', 'reorder_tasks',
  'view_notes', 'edit_notes', 'edit_budget', 'manage_share',
];

const sessions = new Hono<{ Bindings: Env }>();

// POST /sessions — create a new session
sessions.post('/', async (c) => {
  const body = await c.req.json<{ encryptedData: string; crdtState?: string }>();
  if (!body.encryptedData) return c.json({ error: 'missing_encrypted_data' }, 400);

  const kv = c.env.SESSIONS;
  const meta = await getMeta(kv);

  if (meta.sessionCount >= SESSION_LIMIT) {
    return c.json({ error: 'session_limit_reached', limit: SESSION_LIMIT }, 429);
  }

  const sessionId = randomAlphanumeric(12);
  const ownerShareCode = randomAlphanumeric(16);
  const now = new Date().toISOString();

  const session = {
    id: sessionId,
    version: 1,
    createdAt: now,
    lastAccess: now,
    encryptedData: body.encryptedData,
    crdtState: body.crdtState ?? emptyState(),
    shareCodes: {
      [ownerShareCode]: { permissions: ALL_PERMISSIONS, createdAt: now },
    },
  };

  // Initialize the Durable Object for this session
  const stub = c.env.SESSION_DO.get(c.env.SESSION_DO.idFromName(sessionId));
  const initResp = await stub.fetch(new Request('http://do/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  }));

  if (!initResp.ok) return c.json({ error: 'session_init_failed' }, 500);

  await putMeta(kv, { ...meta, sessionCount: meta.sessionCount + 1 });

  return c.json({ sessionId, ownerShareCode }, 201);
});

export default sessions;
