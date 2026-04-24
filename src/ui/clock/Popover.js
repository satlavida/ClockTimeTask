import { S } from '../../logic/state.js';
import { taskTimings } from './ClockSVG.js';
import { absToTime, durStr } from '../../logic/time.js';

export function initPopover() {
  const svg = document.getElementById('clockSvg');
  svg.addEventListener('mousemove', onArcHover);
  svg.addEventListener('mouseleave', hidePop);
}

function onArcHover(e) {
  const path = e.target.closest('path[data-ti]');
  if (!path) { hidePop(); return; }
  const ti = parseInt(path.dataset.ti);
  if (isNaN(ti) || !taskTimings[ti] || !S.tasks[ti]) { hidePop(); return; }

  const task = S.tasks[ti];
  const { startAbs, endAbs } = taskTimings[ti];

  document.getElementById('popDot').style.background = task.color;
  document.getElementById('popName').textContent     = task.name;
  document.getElementById('popStart').textContent    = absToTime(startAbs);
  document.getElementById('popEnd').textContent      = absToTime(endAbs);
  document.getElementById('popDur').textContent      = durStr(task.duration);

  const pop = document.getElementById('popover');
  pop.style.display = 'block';

  const pw = 180, ph = 100;
  const x  = e.clientX + 18;
  const y  = e.clientY - 14;
  pop.style.left = (x + pw > window.innerWidth  ? e.clientX - pw - 8 : x) + 'px';
  pop.style.top  = (y + ph > window.innerHeight ? e.clientY - ph - 8 : y) + 'px';
}

function hidePop() {
  document.getElementById('popover').style.display = 'none';
}
