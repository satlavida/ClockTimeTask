import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import { MockKV } from './mockKV.js';
import { makeMockSessionDO } from './mockSessionDO.js';
import type { Env } from '../src/types.js';

const FAKE_ENCRYPTED = btoa('{"tasks":[],"notes":"","mode":"free","budget":480}');

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

async function createSession() {
  const env = makeEnv();
  const res = await worker.fetch(
    new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptedData: FAKE_ENCRYPTED }),
    }),
    env
  );
  expect(res.status).toBe(201);
  const { sessionId, ownerShareCode } = await json(res);
  return { env, sessionId, ownerShareCode };
}

async function doPut(env: Env, sessionId: string, shareCode: string, body: object) {
  return worker.fetch(
    new Request(`http://localhost/api/sessions/${sessionId}/sync`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${shareCode}` },
      body: JSON.stringify(body),
    }),
    env
  );
}

// ── 1.1 PUT /sync — version conflict is gone ──────────────────────────────────

describe('1.1 PUT /sync — version conflict removed', () => {
  it('1.1.1 clientVersion missing from body → 200', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await doPut(env, sessionId, ownerShareCode, { encryptedData: FAKE_ENCRYPTED });
    expect(res.status).toBe(200);
  });

  it('1.1.2 clientVersion behind server → 200, not 409', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    // bump server to version 2
    await doPut(env, sessionId, ownerShareCode, { encryptedData: FAKE_ENCRYPTED });
    // send clientVersion=1 (behind)
    const res = await doPut(env, sessionId, ownerShareCode, {
      encryptedData: FAKE_ENCRYPTED,
      clientVersion: 1,
    });
    expect(res.status).toBe(200);
    expect((await json(res)).error).toBeUndefined();
  });

  it('1.1.3 crdtUpdate missing from body → 200', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await doPut(env, sessionId, ownerShareCode, { encryptedData: FAKE_ENCRYPTED });
    expect(res.status).toBe(200);
  });

  it('1.1.4 empty body {} → 400 missing_fields', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await doPut(env, sessionId, ownerShareCode, {});
    expect(res.status).toBe(400);
  });

  it('1.1.5 two sequential PUTs from different share codes → both 200, version increments', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const createRes = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/share-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerShareCode}` },
        body: JSON.stringify({ permissions: ['view_tasks', 'edit_tasks', 'reorder_tasks'] }),
      }),
      env
    );
    const { shareCode: editorCode } = await json(createRes);

    const r1 = await doPut(env, sessionId, ownerShareCode, { encryptedData: FAKE_ENCRYPTED });
    expect(r1.status).toBe(200);
    const b1 = await json(r1);

    const enc2 = btoa('{"tasks":[{"id":"2"}]}');
    const r2 = await doPut(env, sessionId, editorCode, { encryptedData: enc2 });
    expect(r2.status).toBe(200);
    const b2 = await json(r2);
    expect(b2.version).toBe(b1.version + 1);
  });

  it('1.1.6 PUT /sync without Authorization header → 401', async () => {
    const { env, sessionId } = await createSession();
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/sync`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedData: FAKE_ENCRYPTED }),
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it('1.1.7 PUT /sync with view-only share code → 403', async () => {
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

    const res = await doPut(env, sessionId, viewCode, { encryptedData: FAKE_ENCRYPTED });
    expect(res.status).toBe(403);
  });
});

// ── 1.2 PUT /sync — version increment and response shape ──────────────────────

describe('1.2 PUT /sync — response shape', () => {
  it('1.2.1 successful PUT has { encryptedData, version }', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await doPut(env, sessionId, ownerShareCode, { encryptedData: FAKE_ENCRYPTED });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toHaveProperty('encryptedData');
    expect(body).toHaveProperty('version');
  });

  it('1.2.2 response has no crdtState field', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await doPut(env, sessionId, ownerShareCode, { encryptedData: FAKE_ENCRYPTED });
    const body = await json(res);
    expect('crdtState' in body).toBe(false);
  });

  it('1.2.3 version in response = previous version + 1', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const r1 = await doPut(env, sessionId, ownerShareCode, { encryptedData: FAKE_ENCRYPTED });
    const v1 = (await json(r1)).version;

    const enc2 = btoa('{"tasks":[{"id":"x"}]}');
    const r2 = await doPut(env, sessionId, ownerShareCode, { encryptedData: enc2 });
    const v2 = (await json(r2)).version;
    expect(v2).toBe(v1 + 1);
  });

  it('1.2.4 encryptedData in response matches what was PUT', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const payload = btoa('{"tasks":[{"id":"abc","name":"test"}]}');
    const res = await doPut(env, sessionId, ownerShareCode, { encryptedData: payload });
    const body = await json(res);
    expect(body.encryptedData).toBe(payload);
  });
});

// ── 1.3 POST /sessions — CRDT field removed ───────────────────────────────────

describe('1.3 POST /sessions — crdtState removed', () => {
  it('1.3.1 create session without crdtState → 201', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedData: FAKE_ENCRYPTED }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.sessionId).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(body.ownerShareCode).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  it('1.3.2 create session with crdtState in body → 201, field ignored', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedData: FAKE_ENCRYPTED, crdtState: 'ignored' }),
      }),
      env
    );
    expect(res.status).toBe(201);
  });

  it('1.3.3 stored session record has no crdtState key (join reveals stored state)', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const joinRes = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerShareCode}` },
      }),
      env
    );
    const body = await json(joinRes);
    expect('crdtState' in body).toBe(false);
  });
});

// ── 1.4 POST /sessions/:id/join — CRDT field removed ─────────────────────────

describe('1.4 POST /sessions/:id/join — response shape', () => {
  it('1.4.1 join response has { encryptedData, permissions, version, name }', async () => {
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
    expect(body).toHaveProperty('encryptedData');
    expect(body).toHaveProperty('permissions');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('name');
  });

  it('1.4.2 join response has no crdtState field', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerShareCode}` },
      }),
      env
    );
    const body = await json(res);
    expect('crdtState' in body).toBe(false);
  });
});

// ── 8. Regression — existing backend API contracts ───────────────────────────

describe('POST /api/sessions — regression', () => {
  it('8.1 returns { sessionId, ownerShareCode }', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedData: FAKE_ENCRYPTED }),
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
        body: JSON.stringify({}),
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

describe('POST /api/sessions/:id/join — regression', () => {
  it('8.2 join returns encryptedData', async () => {
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
  });

  it('8.3 join returns permissions array', async () => {
    const { env, sessionId, ownerShareCode } = await createSession();
    const res = await worker.fetch(
      new Request(`http://localhost/api/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerShareCode}` },
      }),
      env
    );
    const body = await json(res);
    expect(Array.isArray(body.permissions)).toBe(true);
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

describe('GET /share-codes — regression (8.4)', () => {
  it('8.4 GET /share-codes returns 200 with shareCodes array', async () => {
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
});

describe('POST /share-codes — regression (8.5)', () => {
  it('8.5 POST /share-codes creates a new code with permissions', async () => {
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

describe('DELETE /share-codes/:code — regression (8.6)', () => {
  it('8.6 revoke share code → 204, revoked code can no longer join', async () => {
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
});

describe('DELETE /api/sessions/:id — regression (8.7)', () => {
  it('8.7 deletes a session with owner code → 204, then join returns 404', async () => {
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
