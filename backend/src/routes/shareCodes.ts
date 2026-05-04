import { Hono } from 'hono';
import type { Env, Permission } from '../types.js';
import { getSession, putSession } from '../lib/kv.js';
import { extractShareCode, validateShareCode, randomAlphanumeric } from '../lib/auth.js';

const shareCodes = new Hono<{ Bindings: Env }>();

// GET /sessions/:id/share-codes
shareCodes.get('/:id/share-codes', async (c) => {
  const id = c.req.param('id');
  const shareCode = extractShareCode(c.req.header('Authorization'));
  if (!shareCode) return c.json({ error: 'missing_share_code' }, 401);

  const kv = c.env.SESSIONS;
  const session = await getSession(kv, id);
  if (!session) return c.json({ error: 'session_not_found' }, 404);

  const perms = validateShareCode(session, shareCode, 'manage_share');
  if (!perms) return c.json({ error: 'forbidden' }, 403);

  const codes = Object.entries(session.shareCodes).map(([code, entry]) => ({
    shareCode: code,
    permissions: entry.permissions,
    createdAt: entry.createdAt,
  }));

  return c.json({ shareCodes: codes });
});

// POST /sessions/:id/share-codes
shareCodes.post('/:id/share-codes', async (c) => {
  const id = c.req.param('id');
  const shareCode = extractShareCode(c.req.header('Authorization'));
  if (!shareCode) return c.json({ error: 'missing_share_code' }, 401);

  const kv = c.env.SESSIONS;
  const session = await getSession(kv, id);
  if (!session) return c.json({ error: 'session_not_found' }, 404);

  const perms = validateShareCode(session, shareCode, 'manage_share');
  if (!perms) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json<{ permissions: Permission[] }>();
  if (!Array.isArray(body.permissions) || body.permissions.length === 0) {
    return c.json({ error: 'invalid_permissions' }, 400);
  }

  const newCode = randomAlphanumeric(16);
  const now = new Date().toISOString();
  const entry = { permissions: body.permissions, createdAt: now };

  await putSession(kv, {
    ...session,
    lastAccess: now,
    shareCodes: { ...session.shareCodes, [newCode]: entry },
  });

  return c.json({ shareCode: newCode, permissions: body.permissions, createdAt: now }, 201);
});

// DELETE /sessions/:id/share-codes/:code
shareCodes.delete('/:id/share-codes/:code', async (c) => {
  const id = c.req.param('id');
  const codeToRevoke = c.req.param('code');
  const shareCode = extractShareCode(c.req.header('Authorization'));
  if (!shareCode) return c.json({ error: 'missing_share_code' }, 401);

  const kv = c.env.SESSIONS;
  const session = await getSession(kv, id);
  if (!session) return c.json({ error: 'session_not_found' }, 404);

  const perms = validateShareCode(session, shareCode, 'manage_share');
  if (!perms) return c.json({ error: 'forbidden' }, 403);

  // Prevent revoking own share code
  if (codeToRevoke === shareCode) return c.json({ error: 'cannot_revoke_own_code' }, 400);

  if (!session.shareCodes[codeToRevoke]) return c.json({ error: 'share_code_not_found' }, 404);

  const updated = { ...session.shareCodes };
  delete updated[codeToRevoke];
  const now = new Date().toISOString();

  await putSession(kv, { ...session, lastAccess: now, shareCodes: updated });

  return c.body(null, 204);
});

export default shareCodes;
