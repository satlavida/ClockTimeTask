import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import { MockKV } from './mockKV.js';
import { makeMockSessionDO } from './mockSessionDO.js';
import { emptyState } from '../src/lib/crdt.js';
import type { Env } from '../src/types.js';

const FAKE_ENCRYPTED = btoa('{"tasks":[],"notes":"","mode":"free","budget":480}');
const FAKE_CRDT = emptyState();

function makeEnv(): Env {
  const env = {
    SESSIONS: new MockKV() as unknown as KVNamespace,
    ENVIRONMENT: 'test',
  } as Env;
  env.SESSION_DO = makeMockSessionDO(env);
  return env;
}

async function json(res: Response) {
  return res.json();
}

// Helper: create a session and return { env, sessionId, ownerShareCode }
async function createSession() {
  const env = makeEnv();
  const res = await worker.fetch(
    new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptedData: FAKE_ENCRYPTED, crdtState: FAKE_CRDT }),
    }),
    env
  );
  expect(res.status).toBe(201);
  const { sessionId, ownerShareCode } = await json(res);
  return { env, sessionId, ownerShareCode };
}

describe('POST /api/sessions', () => {
  it('creates a session and returns sessionId + ownerShareCode', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedData: FAKE_ENCRYPTED, crdtState: FAKE_CRDT }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.sessionId).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(body.ownerShareCode).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  it('returns 400 when encryptedData is missing', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crdtState: FAKE_CRDT }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('returns 429 when session cap is reached', async () => {
    const env = makeEnv();
    await (env.SESSIONS as unknown as MockKV).put('meta', JSON.stringify({ sessionCount: 50, lastSweep: new Date().toISOString() }));
    const res = await worker.fetch(
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedData: FAKE_ENCRYPTED }),
      }),
      env
    );
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.error).toBe('session_limit_reached');
    expect(body.limit).toBe(50);
  });
});

describe('POST /api/sessions/:id/join', () => {
  it('returns session data for a valid share code', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerShareCode}` },
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.encryptedData).toBe(FAKE_ENCRYPTED);
    expect(body.permissions).toContain('manage_share');
    expect(body.version).toBe(1);
  });

  it('returns 403 for an invalid share code', async () => {
    const { env, sessionId } = await createSession();
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { Authorization: 'Bearer INVALID1234567890' },
      }),
      env
    );
    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ error: 'invalid_share_code' });
  });

  it('returns 404 for a non-existent session', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request('http://localhost/api/sessions/NOSUCHSESSION/join', {
        method: 'POST',
        headers: { Authorization: 'Bearer SOMECODE12345678' },
      }),
      env
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 when no Authorization header', async () => {
    const { env, sessionId } = await createSession();
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/join`, { method: 'POST' }),
      env
    );
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/sessions/:id/sync', () => {
  it('merges update and increments version', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const newEncrypted = btoa('{"tasks":[{"id":"1","name":"Test"}],"notes":""}');
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/sync`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerShareCode}`,
        },
        body: JSON.stringify({
          encryptedData: newEncrypted,
          crdtUpdate: FAKE_CRDT,
          clientVersion: 1,
        }),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.version).toBe(2);
    expect(body.encryptedData).toBe(newEncrypted);
  });

  it('returns 409 when clientVersion does not match server version', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    // Bump server to version 2
    await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/sync`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerShareCode}` },
        body: JSON.stringify({ encryptedData: FAKE_ENCRYPTED, crdtUpdate: FAKE_CRDT, clientVersion: 1 }),
      }),
      env
    );
    // Client still at version 1 — conflict
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/sync`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerShareCode}` },
        body: JSON.stringify({ encryptedData: FAKE_ENCRYPTED, crdtUpdate: FAKE_CRDT, clientVersion: 1 }),
      }),
      env
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe('version_conflict');
    expect(body.serverVersion).toBe(2);
  });

  it('returns 403 for a view-only share code', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const createRes = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/share-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerShareCode}` },
        body: JSON.stringify({ permissions: ['view_tasks', 'view_notes'] }),
      }),
      env
    );
    const { shareCode: viewCode } = await json(createRes);

    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/sync`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${viewCode}` },
        body: JSON.stringify({ encryptedData: FAKE_ENCRYPTED, crdtUpdate: FAKE_CRDT, clientVersion: 1 }),
      }),
      env
    );
    expect(res.status).toBe(403);
  });
});

describe('Share codes management', () => {
  it('creates a share code with custom permissions', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/share-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerShareCode}` },
        body: JSON.stringify({ permissions: ['view_tasks', 'view_notes'] }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.shareCode).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(body.permissions).toEqual(['view_tasks', 'view_notes']);
  });

  it('lists all share codes', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/share-codes`, {
        headers: { Authorization: `Bearer ${ownerShareCode}` },
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body.shareCodes)).toBe(true);
    expect(body.shareCodes).toHaveLength(1);
    expect(body.shareCodes[0].permissions).toContain('manage_share');
  });

  it('revokes a share code', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const createRes = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/share-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerShareCode}` },
        body: JSON.stringify({ permissions: ['view_tasks'] }),
      }),
      env
    );
    const { shareCode: guestCode } = await json(createRes);

    const deleteRes = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/share-codes/${guestCode}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerShareCode}` },
      }),
      env
    );
    expect(deleteRes.status).toBe(204);

    const joinRes = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${guestCode}` },
      }),
      env
    );
    expect(joinRes.status).toBe(403);
  });

  it('prevents revoking own share code', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/share-codes/${ownerShareCode}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerShareCode}` },
      }),
      env
    );
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: 'cannot_revoke_own_code' });
  });

  it('returns 400 for empty permissions array', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/share-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerShareCode}` },
        body: JSON.stringify({ permissions: [] }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when non-owner tries to manage share codes', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const createRes = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/share-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerShareCode}` },
        body: JSON.stringify({ permissions: ['view_tasks', 'edit_tasks'] }),
      }),
      env
    );
    const { shareCode: editorCode } = await json(createRes);

    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/share-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editorCode}` },
        body: JSON.stringify({ permissions: ['view_tasks'] }),
      }),
      env
    );
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/sessions/:id', () => {
  it('deletes a session with owner code', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerShareCode}` },
      }),
      env
    );
    expect(res.status).toBe(204);

    const joinRes = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerShareCode}` },
      }),
      env
    );
    expect(joinRes.status).toBe(404);
  });

  it('returns 403 when a non-owner tries to delete', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const createRes = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/share-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerShareCode}` },
        body: JSON.stringify({ permissions: ['view_tasks', 'edit_tasks'] }),
      }),
      env
    );
    const { shareCode: editorCode } = await json(createRes);

    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${editorCode}` },
      }),
      env
    );
    expect(res.status).toBe(403);
  });
});
