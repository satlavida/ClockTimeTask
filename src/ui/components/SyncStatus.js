import { pushSync, pullSync, isCloudSession, getActiveSession, removeSession, setActiveSession } from '../../logic/sessions.js';
import { toJSON, loadFromJSON, save } from '../../logic/state.js';
import { showToast } from '../Toast.js';

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

// Prevents duplicate "session not found" toasts while the user decides
let _sessionNotFoundToastShown = false;

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

// Force an immediate push + pull, bypassing debounce and pull throttle
export function forceSync() {
  if (!isCloudSession()) return;
  clearTimeout(_pushTimer);
  _lastPullTime = 0; // bypass pull throttle
  _lastPushedJSON = null; // bypass no-op skip
  doPush().then(() => doPull());
}

function errorDelay() {
  return ERROR_BACKOFF[Math.min(_errorCount, ERROR_BACKOFF.length - 1)];
}

function pullInterval() {
  return PULL_BACKOFF[Math.min(_pullIdleCount, PULL_BACKOFF.length - 1)];
}

async function doPush() {
  if (!isCloudSession()) return;

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
      // Version conflict — server is ahead; pull first, then re-push
      showToast('Remote has newer changes — pulling first…', { type: 'warn', duration: 4_000 });
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
    _sessionNotFoundToastShown = false;
    setStatus('synced');
  } catch (err) {
    handleSyncError(err);
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
      _pullIdleCount++;
      setStatus('synced');
      return;
    }

    _pullIdleCount  = 0;
    _lastPushedJSON = result.stateJSON;
    loadFromJSON(result.stateJSON);
    save();
    _onStateUpdated?.();
    _sessionNotFoundToastShown = false;
    setStatus('synced');
  } catch (err) {
    handleSyncError(err);
  }
}

function handleSyncError(err) {
  const code = err.message;

  if (code === 'session_not_found') {
    setStatus('error');
    _nextRetryMs = 0; // don't auto-retry a dead session

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
    return;
  }

  if (code === 'forbidden') {
    setStatus('error');
    _nextRetryMs = 0;
    showToast('Sync failed: share code is no longer valid.', { type: 'error', duration: 8_000 });
    return;
  }

  // Generic network/server error — backoff and retry
  _nextRetryMs = errorDelay();
  _errorCount++;
  setStatus(navigator.onLine ? 'error' : 'offline');
  if (navigator.onLine) schedulePush(_nextRetryMs);
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

  const dot      = el.querySelector('.sync-dot');
  const label    = el.querySelector('.sync-lbl');
  const forceBtn = el.querySelector('.sync-force-btn');
  el.className = `sync-status ${_state}`;

  if (_state === 'syncing') {
    dot.className     = 'sync-dot spinning';
    label.textContent = 'Syncing…';
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

export function refreshSyncDisplay() {
  render();
}
