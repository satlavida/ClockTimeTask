import { KEY } from './constants.js';

export const S = {
  mode: 'free',
  startTime: null,
  budget: { inputMode: 'duration', hours: 2, mins: 0, endTimeStr: null, count: 3 },
  tasks: [],
  notes: [],
  settings: { showTimeRemaining: true, clock24h: false, fitClock: false, soundAlerts: false },
};

export function save() {
  localStorage.setItem(KEY, JSON.stringify({
    ...S, startTime: S.startTime?.toISOString(),
  }));
}

export function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d) return;
    S.mode      = d.mode    || 'free';
    S.budget    = { ...S.budget,   ...(d.budget   || {}) };
    S.settings  = { ...S.settings, ...(d.settings || {}) };
    S.tasks     = d.tasks   || [];
    S.notes     = d.notes   || [];
    S.startTime = d.startTime ? new Date(d.startTime) : null;
  } catch (_) { /* corrupt storage — use defaults */ }
}
