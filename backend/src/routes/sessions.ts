import { Hono } from 'hono';
import type { Env, Permission } from '../types.js';
import { getMeta, putMeta, getSession, putSession, deleteSession } from '../lib/kv.js';
import { sweepIfNeeded } from '../lib/sweep.js';
import { emptyState } from '../lib/crdt.js';
import { randomAlphanumeric, extractShareCode, getPermissions } from '../lib/auth.js';

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
  let meta = await getMeta(kv);
  meta = await sweepIfNeeded(kv, meta);

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

  await putSession(kv, session);
  await putMeta(kv, { ...meta, sessionCount: meta.sessionCount + 1 });

  return c.json({ sessionId, ownerShareCode }, 201);
});

// POST /sessions/:id/join — join with share code
sessions.post('/:id/join', async (c) => {
  const id = c.req.param('id');
  const shareCode = extractShareCode(c.req.header('Authorization'));
  if (!shareCode) return c.json({ error: 'missing_share_code' }, 401);

  const kv = c.env.SESSIONS;
  const session = await getSession(kv, id);
  if (!session) return c.json({ error: 'session_not_found' }, 404);

  const permissions = getPermissions(session, shareCode);
  if (!permissions) return c.json({ error: 'invalid_share_code' }, 403);

  const now = new Date().toISOString();
  await putSession(kv, { ...session, lastAccess: now });

  return c.json({
    encryptedData: session.encryptedData,
    crdtState: session.crdtState,
    permissions,
    version: session.version,
  });
});

// DELETE /sessions/:id — delete entire session (owner only)
sessions.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const shareCode = extractShareCode(c.req.header('Authorization'));
  if (!shareCode) return c.json({ error: 'missing_share_code' }, 401);

  const kv = c.env.SESSIONS;
  const session = await getSession(kv, id);
  if (!session) return c.json({ error: 'session_not_found' }, 404);

  const permissions = getPermissions(session, shareCode);
  if (!permissions?.includes('manage_share')) return c.json({ error: 'forbidden' }, 403);

  await deleteSession(kv, id);

  const meta = await getMeta(kv);
  await putMeta(kv, { ...meta, sessionCount: Math.max(0, meta.sessionCount - 1) });

  return c.body(null, 204);
});

export default sessions;
