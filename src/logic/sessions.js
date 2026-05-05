import * as Y from 'yjs';

const SESSIONS_KEY = 'clocktask_sessions_v1';
const ACTIVE_KEY   = 'clocktask_active_session_v1';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8787'
  : 'https://clocktask-api.satlavida.workers.dev';

// In-memory CryptoKey cache — never persisted
const keyCache = new Map();

const ALL_PERMISSIONS = [
  'view_tasks', 'edit_tasks', 'reorder_tasks',
  'view_notes', 'edit_notes', 'edit_budget', 'manage_share',
];

// ── Registry helpers ──────────────────────────────────────────────────────────

function loadRegistry() {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) || 'null') ?? [];
  } catch (_) { return []; }
}

function saveRegistry(list) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
}

export function getSessions() {
  const list = loadRegistry();
  // Always ensure the local session is present
  if (!list.find(s => s.id === 'local')) {
    list.unshift({ id: 'local', name: 'Local', type: 'local', shareCode: null, lastSynced: null, version: 0, permissions: ALL_PERMISSIONS });
    saveRegistry(list);
  }
  return list;
}

function upsertSession(entry) {
  const list = getSessions();
  const idx  = list.findIndex(s => s.id === entry.id);
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  saveRegistry(list);
}

export function removeSession(id) {
  const list = getSessions().filter(s => s.id !== id);
  saveRegistry(list);
  if (getActiveSessionId() === id) setActiveSession('local');
}

// ── Active session ────────────────────────────────────────────────────────────

export function getActiveSessionId() {
  return localStorage.getItem(ACTIVE_KEY) || 'local';
}

export function getActiveSession() {
  const id   = getActiveSessionId();
  const list = getSessions();
  return list.find(s => s.id === id) ?? list[0];
}

export function setActiveSession(id) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function getActivePermissions() {
  const session = getActiveSession();
  return session?.permissions ?? ALL_PERMISSIONS;
}

export function isCloudSession() {
  return getActiveSession()?.type === 'cloud';
}

// ── Crypto ────────────────────────────────────────────────────────────────────

async function deriveKey(sessionId, shareCode) {
  const cacheKey = `${sessionId}:${shareCode}`;
  if (keyCache.has(cacheKey)) return keyCache.get(cacheKey);

  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(shareCode),
    { name: 'PBKDF2' }, false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode(sessionId), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
  keyCache.set(cacheKey, key);
  return key;
}

async function encryptState(sessionId, shareCode, plaintext) {
  const key = await deriveKey(sessionId, shareCode);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...out));
}

async function decryptState(sessionId, shareCode, b64) {
  const key   = await deriveKey(sessionId, shareCode);
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return new TextDecoder().decode(plain);
}

// ── CRDT helpers ──────────────────────────────────────────────────────────────

function emptyYjsState() {
  const doc = new Y.Doc();
  const state = Y.encodeStateAsUpdate(doc);
  return btoa(String.fromCharCode(...state));
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path, method, shareCode, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (shareCode) headers['Authorization'] = `Bearer ${shareCode}`;
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

// ── Session operations ────────────────────────────────────────────────────────

export async function createCloudSession(name, stateJSON, importCurrent) {
  const tempId    = crypto.randomUUID();
  const tempCode  = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const plaintext = importCurrent ? stateJSON : JSON.stringify({ tasks: [], notes: [], mode: 'free', budget: { inputMode: 'duration', hours: 2, mins: 0, endTimeStr: null, count: 3 }, startTime: new Date().toISOString() });

  // Encrypt with temp credentials — after we get the real sessionId we re-encrypt
  // (we encrypt once here for the POST; the real sessionId is unknown until response)
  // Work-around: use a placeholder session ID for key derivation, then re-encrypt with real ID
  // Instead: we upload a dummy crdtState and do a real encrypt after we have the sessionId
  // To keep it simple: two-step — POST with a placeholder, then immediately PUT /sync with real encryption

  // Step 1: create session with unencrypted-but-base64 payload as placeholder
  const placeholder = btoa(plaintext);
  const res = await apiFetch('/sessions', 'POST', null, {
    encryptedData: placeholder,
    crdtState: emptyYjsState(),
  });
  if (!res.ok) {
    const body = await res.json();
    throw Object.assign(new Error(body.error ?? 'create_failed'), { status: res.status });
  }
  const { sessionId, ownerShareCode } = await res.json();

  // Step 2: re-encrypt with real sessionId and immediately push
  const encryptedData = await encryptState(sessionId, ownerShareCode, plaintext);
  const syncRes = await apiFetch(`/sessions/${sessionId}/sync`, 'PUT', ownerShareCode, {
    encryptedData,
    crdtUpdate: emptyYjsState(),
    clientVersion: 1,
  });
  if (!syncRes.ok) throw new Error('initial_sync_failed');
  const { version } = await syncRes.json();

  const entry = {
    id: sessionId,
    name: name || 'My Session',
    type: 'cloud',
    shareCode: ownerShareCode,
    lastSynced: new Date().toISOString(),
    version,
    permissions: ALL_PERMISSIONS,
  };
  upsertSession(entry);
  return { sessionId, ownerShareCode };
}

export async function joinSession(sessionId, shareCode, { persist = true } = {}) {
  const res = await apiFetch(`/sessions/${sessionId}/join`, 'POST', shareCode, {});
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? 'join_failed'), { status: res.status });
  }
  const { encryptedData, permissions, version } = await res.json();
  const plaintext = await decryptState(sessionId, shareCode, encryptedData);

  const entry = {
    id: sessionId,
    name: `Session ${sessionId.slice(0, 6)}`,
    type: 'cloud',
    shareCode,
    lastSynced: new Date().toISOString(),
    version,
    permissions,
  };
  if (persist) upsertSession(entry);
  return { stateJSON: plaintext, permissions, entry };
}

export async function pushSync(stateJSON) {
  const session = getActiveSession();
  if (!session || session.type !== 'cloud') return null;

  const encryptedData = await encryptState(session.id, session.shareCode, stateJSON);
  const res = await apiFetch(`/sessions/${session.id}/sync`, 'PUT', session.shareCode, {
    encryptedData,
    crdtUpdate: emptyYjsState(),
    clientVersion: session.version,
  });

  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    return { conflict: true, serverVersion: body.serverVersion };
  }
  if (res.status === 404) throw Object.assign(new Error('session_not_found'), { status: 404 });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('forbidden'), { status: res.status });
  if (!res.ok) throw Object.assign(new Error('sync_push_failed'), { status: res.status });

  const { version, encryptedData: serverEncrypted } = await res.json();
  upsertSession({ ...session, version, lastSynced: new Date().toISOString() });

  // Decrypt server response in case it differs (concurrent edit resolved)
  const serverPlain = await decryptState(session.id, session.shareCode, serverEncrypted);
  return { stateJSON: serverPlain, version };
}

export async function pullSync() {
  const session = getActiveSession();
  if (!session || session.type !== 'cloud') return null;

  const res = await apiFetch(`/sessions/${session.id}/sync?sinceVersion=${session.version}`, 'GET', session.shareCode);
  if (res.status === 204) return null; // no changes
  if (res.status === 404) throw Object.assign(new Error('session_not_found'), { status: 404 });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('forbidden'), { status: res.status });
  if (!res.ok) throw Object.assign(new Error('sync_pull_failed'), { status: res.status });
  const { encryptedData, version } = await res.json();
  const stateJSON = await decryptState(session.id, session.shareCode, encryptedData);
  upsertSession({ ...session, version, lastSynced: new Date().toISOString() });
  return { stateJSON, version };
}

export async function deleteCloudSession(sessionId) {
  const session = getSessions().find(s => s.id === sessionId);
  if (!session) return;
  await apiFetch(`/sessions/${sessionId}`, 'DELETE', session.shareCode);
  removeSession(sessionId); // also resets active session if needed
}

// ── Share code management ─────────────────────────────────────────────────────

export async function listShareCodes() {
  const session = getActiveSession();
  if (!session || session.type !== 'cloud') return [];
  const res = await apiFetch(`/sessions/${session.id}/share-codes`, 'GET', session.shareCode);
  if (!res.ok) throw new Error('list_share_codes_failed');
  const { shareCodes } = await res.json();
  return shareCodes;
}

export async function createShareCode(permissions) {
  const session = getActiveSession();
  if (!session || session.type !== 'cloud') throw new Error('not_cloud_session');
  const res = await apiFetch(`/sessions/${session.id}/share-codes`, 'POST', session.shareCode, { permissions });
  if (!res.ok) throw new Error('create_share_code_failed');
  return res.json();
}

export async function revokeShareCode(code) {
  const session = getActiveSession();
  if (!session || session.type !== 'cloud') throw new Error('not_cloud_session');
  const res = await apiFetch(`/sessions/${session.id}/share-codes/${code}`, 'DELETE', session.shareCode);
  if (!res.ok) throw new Error('revoke_share_code_failed');
}
