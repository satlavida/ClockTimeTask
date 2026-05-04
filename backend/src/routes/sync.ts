import { Hono } from 'hono';
import type { Env } from '../types.js';
import { getSession, putSession } from '../lib/kv.js';
import { mergeUpdate } from '../lib/crdt.js';
import { extractShareCode, validateShareCode } from '../lib/auth.js';

const sync = new Hono<{ Bindings: Env }>();

// GET /sessions/:id/sync?sinceVersion=N
sync.get('/:id/sync', async (c) => {
  const id = c.req.param('id');
  const shareCode = extractShareCode(c.req.header('Authorization'));
  if (!shareCode) return c.json({ error: 'missing_share_code' }, 401);

  const kv = c.env.SESSIONS;
  const session = await getSession(kv, id);
  if (!session) return c.json({ error: 'session_not_found' }, 404);

  const perms = validateShareCode(session, shareCode, 'view_tasks');
  if (!perms) return c.json({ error: 'forbidden' }, 403);

  const sinceVersion = Number(c.req.query('sinceVersion') ?? 0);
  if (session.version <= sinceVersion) return c.body(null, 204);

  const now = new Date().toISOString();
  await putSession(kv, { ...session, lastAccess: now });

  return c.json({
    encryptedData: session.encryptedData,
    crdtState: session.crdtState,
    version: session.version,
  });
});

// PUT /sessions/:id/sync
sync.put('/:id/sync', async (c) => {
  const id = c.req.param('id');
  const shareCode = extractShareCode(c.req.header('Authorization'));
  if (!shareCode) return c.json({ error: 'missing_share_code' }, 401);

  const kv = c.env.SESSIONS;
  const session = await getSession(kv, id);
  if (!session) return c.json({ error: 'session_not_found' }, 404);

  const canEdit =
    validateShareCode(session, shareCode, 'edit_tasks') ||
    validateShareCode(session, shareCode, 'edit_notes') ||
    validateShareCode(session, shareCode, 'edit_budget');
  if (!canEdit) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json<{
    encryptedData: string;
    crdtUpdate: string;
    clientVersion: number;
  }>();

  if (!body.encryptedData || !body.crdtUpdate || body.clientVersion === undefined) {
    return c.json({ error: 'missing_fields' }, 400);
  }

  // Allow client to be at most 1 version behind; further behind requires a pull first
  if (body.clientVersion < session.version - 1) {
    return c.json({ error: 'version_conflict', serverVersion: session.version }, 409);
  }

  const now = new Date().toISOString();
  const newCrdtState = mergeUpdate(session.crdtState, body.crdtUpdate);
  const updated = {
    ...session,
    version: session.version + 1,
    lastAccess: now,
    encryptedData: body.encryptedData,
    crdtState: newCrdtState,
  };

  await putSession(kv, updated);

  return c.json({
    encryptedData: updated.encryptedData,
    crdtState: updated.crdtState,
    version: updated.version,
  });
});

export default sync;
