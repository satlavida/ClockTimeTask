import { KEY } from './constants.js';
import { getActiveSessionId } from './sessions.js';

export const S = {
  mode: 'free',
  startTime: null,
  budget: { inputMode: 'duration', hours: 2, mins: 0, endTimeStr: null, count: 3 },
  tasks: [],
  notes: [],
  settings: { showTimeRemaining: true, clock24h: false, fitClock: false, soundAlerts: false, linearView: false },
};

function getStateKey() {
  const id = getActiveSessionId();
  return id === 'local' ? KEY : `clocktask_session_${id}_v1`;
}

export function save() {
  localStorage.setItem(getStateKey(), JSON.stringify({
    ...S, startTime: S.startTime?.toISOString(),
  }));
}

export function load() {
  try {
    const d = JSON.parse(localStorage.getItem(getStateKey()) || 'null');
    if (!d) return;
    S.mode      = d.mode    || 'free';
    S.budget    = { ...S.budget,   ...(d.budget   || {}) };
    S.settings  = { ...S.settings, ...(d.settings || {}) };
    S.tasks     = d.tasks   || [];
    S.notes     = d.notes   || [];
    S.startTime = d.startTime ? new Date(d.startTime) : null;
  } catch (_) { /* corrupt storage — use defaults */ }
}

export function loadFromJSON(json) {
  try {
    const d = JSON.parse(json);
    if (!d) return;
    S.mode      = d.mode      || 'free';
    S.budget    = { ...S.budget,   ...(d.budget   || {}) };
    // settings are never synced — only device-local
    S.tasks     = d.tasks     || [];
    S.notes     = d.notes     || [];
    S.startTime = d.startTime ? new Date(d.startTime) : null;
  } catch (_) { /* corrupt payload — ignore */ }
}

export function toJSON() {
  return JSON.stringify({ ...S, startTime: S.startTime?.toISOString() });
}
