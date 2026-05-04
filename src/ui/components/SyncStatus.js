import { pushSync, pullSync, isCloudSession, getActiveSession } from '../../logic/sessions.js';
import { toJSON, loadFromJSON, save } from '../../logic/state.js';

let _onStateUpdated = null;
let _pushTimer      = null;
let _state          = 'idle'; // 'idle' | 'syncing' | 'error' | 'offline'

export function initSyncStatus({ onStateUpdated }) {
  _onStateUpdated = onStateUpdated;

  // Pull on tab focus
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isCloudSession()) schedulePull();
  });

  // Offline / online indicators
  window.addEventListener('offline', () => setStatus('offline'));
  window.addEventListener('online',  () => { setStatus('idle'); debouncePush(0); });
}

// Called by app.js after every save()
export function schedulePush(delayMs = 2000) {
  if (!isCloudSession()) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(doPush, delayMs);
}

async function doPush() {
  if (!isCloudSession()) return;
  setStatus('syncing');
  try {
    const result = await pushSync(toJSON());
    if (!result) { setStatus('idle'); return; }
    if (result.conflict) {
      // Pull first, then push again
      await doPull();
      doPush();
      return;
    }
    if (result.stateJSON) {
      loadFromJSON(result.stateJSON);
      save();
      _onStateUpdated?.();
    }
    setStatus('synced');
  } catch (_) {
    setStatus(navigator.onLine ? 'error' : 'offline');
  }
}

async function schedulePull() {
  await doPull();
}

async function doPull() {
  if (!isCloudSession()) return;
  setStatus('syncing');
  try {
    const result = await pullSync();
    if (result?.stateJSON) {
      loadFromJSON(result.stateJSON);
      save();
      _onStateUpdated?.();
    }
    setStatus('synced');
  } catch (_) {
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

  if (!isCloudSession()) {
    el.hidden = true;
    return;
  }
  el.hidden = false;

  const dot   = el.querySelector('.sync-dot');
  const label = el.querySelector('.sync-lbl');

  el.className = `sync-status ${_state}`;

  if (_state === 'syncing') {
    dot.className   = 'sync-dot spinning';
    label.textContent = 'Syncing…';
  } else if (_state === 'synced') {
    const session = getActiveSession();
    const t = session?.lastSynced ? relTime(session.lastSynced) : 'just now';
    dot.className   = 'sync-dot ok';
    label.textContent = `Synced ${t}`;
  } else if (_state === 'offline') {
    dot.className   = 'sync-dot offline';
    label.textContent = 'Offline';
  } else if (_state === 'error') {
    dot.className   = 'sync-dot error';
    label.textContent = 'Sync failed';
  } else {
    dot.className   = 'sync-dot';
    label.textContent = '';
  }
}

function relTime(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10)  return 'just now';
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function refreshSyncDisplay() {
  render();
}
