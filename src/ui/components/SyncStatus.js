import {
  pushSync, isCloudSession, getActiveSession,
  removeSession, setActiveSession, getWSUrl,
  upsertSession,
} from '../../logic/sessions.js';
import { toJSON, loadFromJSON, save } from '../../logic/state.js';
import { showToast } from '../Toast.js';

// Reconnect backoff ladder (ms): 1s → 2s → 4s → 8s → 30s
const RECONNECT_BACKOFF = [1_000, 2_000, 4_000, 8_000, 30_000];

// Push error backoff ladder (ms): 2s → 4s → 8s → 16s → 30s
const ERROR_BACKOFF = [2_000, 4_000, 8_000, 16_000, 30_000];

let _onStateUpdated  = null;
let _pushTimer       = null;
let _state           = 'idle'; // 'idle' | 'connecting' | 'syncing' | 'synced' | 'error' | 'offline'

// WebSocket state
let _ws              = null;
let _wsSessionId     = null;
let _reconnectTimer  = null;
let _reconnectCount  = 0;

// Push state
let _errorCount      = 0;
let _lastPushedJSON  = null;
let _inflightJSON    = null; // state currently being pushed (in-flight HTTP PUT)
let _nextRetryMs     = 0;

let _sessionNotFoundToastShown = false;

export function initSyncStatus({ onStateUpdated }) {
  _onStateUpdated = onStateUpdated;

  window.addEventListener('offline', () => {
    setStatus('offline');
    disconnectWS(false);
  });

  window.addEventListener('online', () => {
    _errorCount = 0;
    if (isCloudSession()) {
      forceSync(); // push any unsent local changes before applying server state
    } else {
      setStatus('idle');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isCloudSession()) {
      if (!_ws || _ws.readyState !== WebSocket.OPEN) connectWS();
    }
  });

  if (isCloudSession()) connectWS();
}

// Called from app.js after every save()
export function schedulePush(delayMs = 2_000) {
  if (!isCloudSession()) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(doPush, delayMs);
}

// Called when active session changes (app.js → onSessionSwitch)
export function syncConnection() {
  const session = getActiveSession();
  if (!session || session.type !== 'cloud') {
    disconnectWS(false);
    setStatus('idle');
    return;
  }
  if (_wsSessionId === session.id && _ws?.readyState === WebSocket.OPEN) return;
  _reconnectCount = 0;
  _sessionNotFoundToastShown = false;
  disconnectWS(false);
  connectWS();
}

// Force an immediate push, bypass debounce
export function forceSync() {
  if (!isCloudSession()) return;
  _lastPushedJSON = null;
  clearTimeout(_pushTimer);
  // Always push via HTTP — it's independent of the WS connection.
  // If the WS is closed, reconnect in parallel; the 'connected' echo will
  // arrive after our push has already stored the local state on the server.
  doPush();
  if (!_ws || _ws.readyState !== WebSocket.OPEN) {
    connectWS();
  }
}

export function refreshSyncDisplay() {
  render();
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectWS() {
  if (_ws && (_ws.readyState === WebSocket.CONNECTING || _ws.readyState === WebSocket.OPEN)) return;

  const session = getActiveSession();
  if (!session || session.type !== 'cloud') return;

  clearTimeout(_reconnectTimer);
  setStatus('connecting');

  const ws = new WebSocket(getWSUrl(session.id));
  _ws = ws;
  _wsSessionId = session.id;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', shareCode: session.shareCode }));
  };

  ws.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch (_) { return; }

    if (data.type === 'connected' || data.type === 'sync') {
      _reconnectCount = 0;
      // Skip if a push is in-flight — its WS broadcast will arrive next and
      // carry the correct (already-stored) state. Applying stale server state
      // now would overwrite the in-flight payload and trigger a spurious refresh.
      if (_inflightJSON !== null) return;
      // Discard the echo of our own most-recently-pushed state.
      if (data.type === 'sync' && data.encryptedData === _lastPushedJSON) return;
      applyRemoteState(data);
    } else if (data.type === 'session_deleted') {
      handleSessionDeleted();
    } else if (data.type === 'share_code_revoked') {
      handleShareRevoked();
    }
  };

  ws.onclose = (event) => {
    if (_ws !== ws) return; // stale handler after disconnect
    _ws = null;

    // Auth rejections from the DO — don't reconnect
    if (event.code === 1008) {
      handleAuthError(event.reason);
      return;
    }

    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose fires after onerror; no separate action needed
  };
}

function disconnectWS(allowReconnect = true) {
  clearTimeout(_reconnectTimer);
  if (_ws) {
    const ws = _ws;
    _ws = null;
    if (!allowReconnect) ws.onclose = null;
    try { ws.close(); } catch (_) { /* ignore */ }
  }
}

function scheduleReconnect() {
  if (!isCloudSession()) return;
  const delay = RECONNECT_BACKOFF[Math.min(_reconnectCount, RECONNECT_BACKOFF.length - 1)];
  _reconnectCount++;
  setStatus('error');
  _reconnectTimer = setTimeout(() => {
    if (isCloudSession()) connectWS();
  }, delay);
}

// ── WS message handlers ───────────────────────────────────────────────────────

function applyRemoteState({ encryptedData, version }) {
  const session = getActiveSession();
  if (!session) return;
  try {
    loadFromJSON(encryptedData);
    save();
    _lastPushedJSON = encryptedData;
    upsertSession({ ...session, version, lastSynced: new Date().toISOString() });
    _onStateUpdated?.();
    // Clear any push timer queued by the refresh above — remote state has already
    // been saved, so there's nothing local to push. Without this, _pushTimer stays
    // non-null for 2 s and blocks the next incoming sync broadcast.
    clearTimeout(_pushTimer);
    _pushTimer = null;
    _sessionNotFoundToastShown = false;
    setStatus('synced');
  } catch (e) {
    console.error('[sync] apply failed', e);
  }
}

function handleSessionDeleted() {
  disconnectWS(false);
  setStatus('error');
  _nextRetryMs = 0;

  if (!_sessionNotFoundToastShown) {
    _sessionNotFoundToastShown = true;
    const session = getActiveSession();
    showToast(
      `Session "${session?.name ?? 'Unknown'}" no longer exists on the server.`,
      {
        type: 'error',
        duration: 15_000,
        action: {
          label: 'Remove',
          onClick: () => {
            const id = session?.id;
            if (id && id !== 'local') {
              removeSession(id);
              setActiveSession('local');
              _onStateUpdated?.();
              _sessionNotFoundToastShown = false;
              setStatus('idle');
            }
          },
        },
      }
    );
  }
}

function handleShareRevoked() {
  disconnectWS(false);
  setStatus('error');
  _nextRetryMs = 0;
  showToast('Sync failed: share code is no longer valid.', { type: 'error', duration: 8_000 });
}

function handleAuthError(reason) {
  if (reason === 'session_not_found') { handleSessionDeleted(); return; }
  if (reason === 'forbidden' || reason === 'share_code_revoked') { handleShareRevoked(); return; }
  // Unknown auth error — backoff and retry
  scheduleReconnect();
}

// ── Push (HTTP PUT) ───────────────────────────────────────────────────────────

async function doPush() {
  _pushTimer = null;
  if (!isCloudSession()) return;

  const currentJSON = toJSON();
  if (currentJSON === _lastPushedJSON) {
    setStatus('synced');
    return;
  }

  _inflightJSON = currentJSON;
  setStatus('syncing');
  try {
    const result = await pushSync(currentJSON);
    _inflightJSON = null;
    if (!result) { setStatus('idle'); return; }

    if (result.stateJSON) {
      loadFromJSON(result.stateJSON);
      save();
      _onStateUpdated?.();
    }

    _errorCount = 0;
    _lastPushedJSON = result.stateJSON ?? currentJSON;
    _sessionNotFoundToastShown = false;
    setStatus('synced');
  } catch (err) {
    _inflightJSON = null;
    handlePushError(err);
  }
}

function handlePushError(err) {
  const code = err.message;

  if (code === 'session_not_found') { handleSessionDeleted(); return; }
  if (code === 'forbidden') { handleShareRevoked(); return; }

  _nextRetryMs = ERROR_BACKOFF[Math.min(_errorCount, ERROR_BACKOFF.length - 1)];
  _errorCount++;
  setStatus(navigator.onLine ? 'error' : 'offline');
  if (navigator.onLine) schedulePush(_nextRetryMs);
}

// ── Render ────────────────────────────────────────────────────────────────────

function setStatus(status) {
  _state = status;
  render();
}

function render() {
  const el = document.getElementById('syncStatus');
  if (!el) return;

  if (!isCloudSession()) { el.hidden = true; return; }
  el.hidden = false;

  const dot      = el.querySelector('.sync-dot');
  const label    = el.querySelector('.sync-lbl');
  const forceBtn = el.querySelector('.sync-force-btn');
  el.className = `sync-status ${_state}`;

  if (_state === 'syncing' || _state === 'connecting') {
    dot.className     = 'sync-dot spinning';
    label.textContent = _state === 'connecting' ? 'Connecting…' : 'Syncing…';
    if (forceBtn) forceBtn.classList.add('spinning');
  } else if (_state === 'synced') {
    const session = getActiveSession();
    const t = session?.lastSynced ? relTime(session.lastSynced) : 'just now';
    dot.className     = 'sync-dot ok';
    label.textContent = `Synced ${t}`;
    if (forceBtn) forceBtn.classList.remove('spinning');
  } else if (_state === 'offline') {
    dot.className     = 'sync-dot offline';
    label.textContent = 'Offline';
    if (forceBtn) forceBtn.classList.remove('spinning');
  } else if (_state === 'error') {
    dot.className     = 'sync-dot error';
    label.textContent = _nextRetryMs > 0 ? `Retry in ${_nextRetryMs / 1000}s` : 'Sync error';
    if (forceBtn) forceBtn.classList.remove('spinning');
  } else {
    dot.className     = 'sync-dot';
    label.textContent = '';
    if (forceBtn) forceBtn.classList.remove('spinning');
  }
}

function relTime(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10)   return 'just now';
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
