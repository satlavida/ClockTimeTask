import { S } from '../logic/state.js';
import { absToTime, durStr } from '../logic/time.js';

let _onTaskEdit = null;

export function initLinearTicker({ onTaskEdit }) {
  _onTaskEdit = onTaskEdit;
}

export function renderTicker() {
  const el = document.getElementById('linearTicker');
  if (!el || el.hidden) return;

  el.innerHTML = '';

  if (!S.startTime || !S.tasks.length) {
    el.innerHTML = '<div class="ticker-empty">No tasks planned</div>';
    return;
  }

  const now      = new Date();
  const nowMins  = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const startAbs = S.startTime.getHours() * 60 + S.startTime.getMinutes();

  let cursor    = startAbs;
  let currentEl = null;

  S.tasks.forEach(task => {
    const tStart    = cursor;
    const tEnd      = cursor + task.duration;
    cursor          = tEnd;

    const isPast    = nowMins >= tEnd;
    const isCurrent = nowMins >= tStart && nowMins < tEnd;
    const isFuture  = nowMins < tStart;

    const row = document.createElement('div');
    row.className = 'ticker-row' +
      (isPast    ? ' past'    : '') +
      (isCurrent ? ' current' : '') +
      (isFuture  ? ' future'  : '');
    row.style.setProperty('--task-color', task.color);

    row.innerHTML = `
      <div class="ticker-left">
        <div class="ticker-time">${absToTime(tStart)}</div>
        <div class="ticker-name">${_esc(task.name)}</div>
        ${isCurrent ? '<div class="ticker-current-lbl">Current</div>' : ''}
      </div>
      <div class="ticker-right">
        <div class="ticker-dur">${durStr(task.duration)}</div>
        <div class="ticker-handle" title="Edit task">⋮</div>
      </div>
    `;

    row.querySelector('.ticker-handle').addEventListener('click', e => {
      e.stopPropagation();
      if (_onTaskEdit) _onTaskEdit(task.id);
    });

    el.appendChild(row);
    if (isCurrent) currentEl = row;
  });

  if (currentEl) {
    setTimeout(() => currentEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }
}

function _esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
