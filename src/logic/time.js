import { S } from './state.js';

export const p2 = n => String(n).padStart(2, '0');

export function hhmm(d) {
  return p2(d.getHours()) + ':' + p2(d.getMinutes());
}

export function durStr(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function absToTime(absMins) {
  const h = Math.floor(absMins / 60) % 24;
  const m = absMins % 60;
  return p2(h) + ':' + p2(m);
}

export function getCycleMins() {
  return S.settings.clock24h ? 1440 : 720;
}

export function minsToAngle(m) {
  return m / getCycleMins() * 360;
}

export function getBudgetMins() {
  if (S.mode !== 'budget') return Infinity;
  if (S.budget.inputMode === 'endtime' && S.budget.endTimeStr) {
    const [eh, em] = S.budget.endTimeStr.split(':').map(Number);
    const endAbs   = eh * 60 + em;
    const startAbs = S.startTime.getHours() * 60 + S.startTime.getMinutes();
    let diff = endAbs - startAbs;
    if (diff <= 0) diff += 1440;
    return diff;
  }
  return S.budget.hours * 60 + S.budget.mins;
}

export function getFitRange() {
  if (!S.settings.fitClock || !S.startTime || S.tasks.length === 0) return null;
  const startAbs = S.startTime.getHours() * 60 + S.startTime.getMinutes();
  const span = S.tasks.reduce((s, t) => s + t.duration, 0);
  if (span === 0) return null;
  return { startAbs, endAbs: startAbs + span, span };
}
