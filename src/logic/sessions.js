import * as Y from 'yjs';

const SESSIONS_KEY = 'clocktask_sessions_v1';
const ACTIVE_KEY   = 'clocktask_active_session_v1';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8787'
  : 'https://clocktask-api.satlavida.workers.dev';

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

// ── CRDT helpers ──────────────────────────────────────────────────────────────

function emptyYjsState() {
  const doc = new Y.Doc();
  const state = Y.encodeStateAsUpdate(doc);
  return btoa(String.fromCharCode(...state));
}

// ── WS helpers ────────────────────────────────────────────────────────────────

export function getWSUrl(sessionId) {
  return `${API_BASE.replace(/^http/, 'ws')}/api/sessions/${sessionId}/ws`;
}

export { upsertSession };

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
  const plaintext = importCurrent
    ? stateJSON
    : JSON.stringify({ tasks: [], notes: [], mode: 'free', budget: { inputMode: 'duration', hours: 2, mins: 0, endTimeStr: null, count: 3 }, startTime: new Date().toISOString() });

  const res = await apiFetch('/sessions', 'POST', null, {
    encryptedData: plaintext,
    crdtState: emptyYjsState(),
  });
  if (!res.ok) {
    const body = await res.json();
    throw Object.assign(new Error(body.error ?? 'create_failed'), { status: res.status });
  }
  const { sessionId, ownerShareCode } = await res.json();

  const entry = {
    id: sessionId,
    name: name || 'My Session',
    type: 'cloud',
    shareCode: ownerShareCode,
    lastSynced: new Date().toISOString(),
    version: 1,
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
  return { stateJSON: encryptedData, permissions, entry };
}

export async function pushSync(stateJSON) {
  const session = getActiveSession();
  if (!session || session.type !== 'cloud') return null;

  const res = await apiFetch(`/sessions/${session.id}/sync`, 'PUT', session.shareCode, {
    encryptedData: stateJSON,
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

  const { version, encryptedData: serverData } = await res.json();
  upsertSession({ ...session, version, lastSynced: new Date().toISOString() });

  return { stateJSON: serverData, version };
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
