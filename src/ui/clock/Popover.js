import { S } from '../../logic/state.js';
import { taskTimings } from './ClockSVG.js';
import { absToTime, durStr } from '../../logic/time.js';

function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches;
}

export function initPopover() {
  const svg = document.getElementById('clockSvg');
  svg.addEventListener('mousemove', onArcHover);
  svg.addEventListener('mouseleave', hidePop);
  svg.addEventListener('touchstart', onArcTouch, { passive: true });

  const backdrop = document.createElement('div');
  backdrop.id = 'popoverBackdrop';
  document.body.appendChild(backdrop);
  backdrop.addEventListener('touchstart', hidePop, { passive: true });
  backdrop.addEventListener('click', hidePop);
}

function showPopForTask(ti) {
  const task = S.tasks[ti];
  const { startAbs, endAbs } = taskTimings[ti];

  document.getElementById('popDot').style.background = task.color;
  document.getElementById('popName').textContent     = task.name;
  document.getElementById('popStart').textContent    = absToTime(startAbs);
  document.getElementById('popEnd').textContent      = absToTime(endAbs);
  document.getElementById('popDur').textContent      = durStr(task.duration);

  const pop      = document.getElementById('popover');
  const backdrop = document.getElementById('popoverBackdrop');

  if (isTouchDevice()) {
    pop.classList.add('touch-mode');
    pop.style.left = '';
    pop.style.top  = '';
    if (backdrop) backdrop.classList.add('visible');
  }

  pop.style.display = 'block';
}

function onArcHover(e) {
  const path = e.target.closest('path[data-ti]');
  if (!path) { hidePop(); return; }
  const ti = parseInt(path.dataset.ti);
  if (isNaN(ti) || !taskTimings[ti] || !S.tasks[ti]) { hidePop(); return; }

  showPopForTask(ti);

  const pop = document.getElementById('popover');
  const pw = 180, ph = 100;
  const x  = e.clientX + 18;
  const y  = e.clientY - 14;
  pop.style.left = (x + pw > window.innerWidth  ? e.clientX - pw - 8 : x) + 'px';
  pop.style.top  = (y + ph > window.innerHeight ? e.clientY - ph - 8 : y) + 'px';
}

function onArcTouch(e) {
  const touch = e.touches[0];
  if (!touch) return;

  const el   = document.elementFromPoint(touch.clientX, touch.clientY);
  const path = el?.closest('path[data-ti]');
  if (!path) { hidePop(); return; }

  const ti = parseInt(path.dataset.ti);
  if (isNaN(ti) || !taskTimings[ti] || !S.tasks[ti]) { hidePop(); return; }

  showPopForTask(ti);
}

function hidePop() {
  const pop      = document.getElementById('popover');
  const backdrop = document.getElementById('popoverBackdrop');
  pop.style.display = 'none';
  pop.classList.remove('touch-mode');
  if (backdrop) backdrop.classList.remove('visible');
}
