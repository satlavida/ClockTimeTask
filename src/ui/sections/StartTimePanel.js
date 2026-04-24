import { S, save } from '../../logic/state.js';
import { hhmm } from '../../logic/time.js';
import { toggleSection } from '../../logic/sections.js';

export function initStartTimePanel({ onStartChange }) {
  const si = document.getElementById('startInput');

  document.querySelector('[data-sec="start"] .s-sec-hd')
    .addEventListener('click', () => toggleSection('start'));

  si.addEventListener('change', e => {
    const [h, m] = e.target.value.split(':').map(Number);
    S.startTime = new Date();
    S.startTime.setHours(h, m, 0, 0);
    save();
    onStartChange();
  });

  document.getElementById('resetStartToNow').addEventListener('click', () => {
    const now = new Date();
    now.setSeconds(0, 0);
    S.startTime = now;
    si.value = hhmm(now);
    save();
    onStartChange();
  });
}

export function syncStartInput() {
  document.getElementById('startInput').value = hhmm(S.startTime);
}
