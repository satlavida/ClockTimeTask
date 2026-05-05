import { pushSync, pullSync, isCloudSession, getActiveSession } from '../../logic/sessions.js';
import { toJSON, loadFromJSON, save } from '../../logic/state.js';

// Error backoff ladder (ms): 2s → 4s → 8s → 16s → 30s
const ERROR_BACKOFF = [2_000, 4_000, 8_000, 16_000, 30_000];

// Pull interval ladder (ms): 30s → 60s → 120s — grows when server returns no changes
const PULL_BACKOFF = [30_000, 60_000, 120_000];

let _onStateUpdated  = null;
let _pushTimer       = null;
let _state           = 'idle'; // 'idle' | 'syncing' | 'error' | 'offline'

// Push side
let _errorCount      = 0;   // consecutive failures; drives ERROR_BACKOFF index
let _lastPushedJSON  = null; // JSON of last successfully pushed state; skip push if unchanged
let _nextRetryMs     = 0;   // delay of the currently-scheduled retry (for the error label)

// Pull side
let _pullIdleCount   = 0;   // consecutive 204s; drives PULL_BACKOFF index
let _lastPullTime    = 0;   // ms timestamp of last pull attempt

export function initSyncStatus({ onStateUpdated }) {
  _onStateUpdated = onStateUpdated;

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isCloudSession()) maybeSchedulePull();
  });

  window.addEventListener('offline', () => setStatus('offline'));
  window.addEventListener('online',  () => {
    _errorCount = 0;
    setStatus('idle');
    schedulePush(0);
  });
}

// Called by app.js after every save()
export function schedulePush(delayMs = 2_000) {
  if (!isCloudSession()) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(doPush, delayMs);
}

function errorDelay() {
  return ERROR_BACKOFF[Math.min(_errorCount, ERROR_BACKOFF.length - 1)];
}

function pullInterval() {
  return PULL_BACKOFF[Math.min(_pullIdleCount, PULL_BACKOFF.length - 1)];
}

async function doPush() {
  if (!isCloudSession()) return;

  // Skip if state hasn't changed since the last successful push
  const currentJSON = toJSON();
  if (currentJSON === _lastPushedJSON) {
    setStatus('synced');
    return;
  }

  setStatus('syncing');
  try {
    const result = await pushSync(currentJSON);
    if (!result) { setStatus('idle'); return; }

    if (result.conflict) {
      // Server is ahead — pull first, then re-push after a short pause
      await doPull();
      schedulePush(1_000);
      return;
    }

    if (result.stateJSON) {
      loadFromJSON(result.stateJSON);
      save();
      _onStateUpdated?.();
    }

    _errorCount     = 0;
    _lastPushedJSON = result.stateJSON ?? currentJSON;
    setStatus('synced');
  } catch (_) {
    _nextRetryMs = errorDelay(); // compute before incrementing so index 0 (2s) is reachable
    _errorCount++;
    setStatus(navigator.onLine ? 'error' : 'offline');
    if (navigator.onLine) schedulePush(_nextRetryMs);
  }
}

function maybeSchedulePull() {
  if (Date.now() - _lastPullTime < pullInterval()) return;
  doPull();
}

async function doPull() {
  if (!isCloudSession()) return;
  _lastPullTime = Date.now();
  setStatus('syncing');
  try {
    const result = await pullSync();

    if (!result) {
      // 204 — no server changes; back off the next pull
      _pullIdleCount++;
      setStatus('synced');
      return;
    }

    // Got new state — reset idle counter
    _pullIdleCount  = 0;
    _lastPushedJSON = result.stateJSON; // server is now the source of truth
    loadFromJSON(result.stateJSON);
    save();
    _onStateUpdated?.();
    setStatus('synced');
  } catch (_) {
    _errorCount++;
    setStatus(navigator.onLine ? 'error' : 'offline');
  }
}

function setStatus(status) {
  _state = status;
  render();
}

function render() {
  const el = document.getElementById('syncStatus');
  if (!el) return;

  if (!isCloudSession()) { el.hidden = true; return; }
  el.hidden = false;

  const dot   = el.querySelector('.sync-dot');
  const label = el.querySelector('.sync-lbl');
  el.className = `sync-status ${_state}`;

  if (_state === 'syncing') {
    dot.className     = 'sync-dot spinning';
    label.textContent = 'Syncing…';
  } else if (_state === 'synced') {
    const session = getActiveSession();
    const t = session?.lastSynced ? relTime(session.lastSynced) : 'just now';
    dot.className     = 'sync-dot ok';
    label.textContent = `Synced ${t}`;
  } else if (_state === 'offline') {
    dot.className     = 'sync-dot offline';
    label.textContent = 'Offline';
  } else if (_state === 'error') {
    dot.className     = 'sync-dot error';
    label.textContent = `Retry in ${_nextRetryMs / 1000}s`;
  } else {
    dot.className     = 'sync-dot';
    label.textContent = '';
  }
}

function relTime(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10)   return 'just now';
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function refreshSyncDisplay() {
  render();
}
