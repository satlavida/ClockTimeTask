import { S, save } from '../../logic/state.js';
import { CX, CY, OR_O, OR_I, IR_O, IR_I, GAP_DEG } from '../../logic/constants.js';
import { getCycleMins, minsToAngle, getFitRange, getBudgetMins, p2 } from '../../logic/time.js';
import { polar, svgEl, donutPath } from '../../logic/clock-geometry.js';

export let taskTimings = []; // [{startAbs, endAbs}] parallel to S.tasks

let drag = null;
let onRedrawCallback = null;

export function initClockSVG({ onDragEnd }) {
  onRedrawCallback = onDragEnd;
}

export function rotateSvg(id, deg) {
  document.getElementById(id).setAttribute('transform', `rotate(${deg},${CX},${CY})`);
}

export function tickHands() {
  const n = new Date();
  const h = n.getHours(), m = n.getMinutes(), s = n.getSeconds();
  const fit = getFitRange();

  if (fit) {
    const nowAbs = h * 60 + m + s / 60;
    const deg = Math.max(0, Math.min(359.9, (nowAbs - fit.startAbs) / fit.span * 360));
    rotateSvg('hHour', deg);
    rotateSvg('hMin',  deg);
    rotateSvg('hSec',  deg);
  } else if (S.settings.clock24h) {
    rotateSvg('hHour', (h + m / 60) * 15);
  } else {
    rotateSvg('hHour', ((h % 12) + m / 60) * 30);
  }

  if (!fit) {
    rotateSvg('hMin', (m + s / 60) * 6);
    rotateSvg('hSec', s * 6);
  }

  document.getElementById('tNow').textContent = p2(h) + ':' + p2(m);
}

export function buildFace() {
  const tg = document.getElementById('gTicks');
  const ng = document.getElementById('gNums');
  tg.innerHTML = '';
  ng.innerHTML = '';

  const fit = getFitRange();
  if (fit) {
    _buildFitFace(tg, ng, fit);
    return;
  }

  if (S.settings.clock24h) {
    _build24hFace(tg, ng);
  } else {
    _build12hFace(tg, ng);
  }
}

function _buildFitFace(tg, ng, { startAbs, endAbs, span }) {
  let tickMin, labelMin;
  if      (span <= 60)  { tickMin = 5;  labelMin = 15; }
  else if (span <= 180) { tickMin = 10; labelMin = 30; }
  else if (span <= 480) { tickMin = 15; labelMin = 60; }
  else if (span <= 960) { tickMin = 30; labelMin = 120; }
  else                  { tickMin = 60; labelMin = 240; }

  const firstTick = Math.ceil((startAbs + 0.5) / tickMin) * tickMin;
  for (let t = firstTick; t < endAbs; t += tickMin) {
    const deg     = (t - startAbs) / span * 360;
    const isLabel = t % labelMin === 0;
    const [x1, y1] = polar(CX, CY, 155, deg);
    const [x2, y2] = polar(CX, CY, isLabel ? 139 : 148, deg);
    tg.appendChild(svgEl('line', {
      x1, y1, x2, y2,
      stroke: isLabel ? '#7a7a7a' : '#333',
      'stroke-width': isLabel ? 1.5 : 1,
      'stroke-linecap': 'round',
    }));
    if (isLabel) {
      const h2 = Math.floor(t / 60) % 24, m2 = t % 60;
      const display = m2 === 0 ? String(h2) : (p2(h2) + ':' + p2(m2));
      const [lx, ly] = polar(CX, CY, 122, deg);
      const txEl = svgEl('text', {
        x: lx, y: ly,
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        fill: '#bbb', 'font-family': 'Helvetica Neue,Arial',
        'font-size': m2 === 0 ? '14.5' : '10', 'font-weight': '300',
      });
      txEl.textContent = display;
      ng.appendChild(txEl);
    }
  }
}

function _build24hFace(tg, ng) {
  for (let i = 0; i < 24; i++) {
    const isQ = i % 6 === 0;
    const deg = i * 15;
    const [x1, y1] = polar(CX, CY, 155, deg);
    const [x2, y2] = polar(CX, CY, isQ ? 139 : 144, deg);
    tg.appendChild(svgEl('line', {
      x1, y1, x2, y2, stroke: '#7a7a7a',
      'stroke-width': isQ ? 2.5 : 1.5, 'stroke-linecap': 'round',
    }));
    const hdeg = deg + 7.5;
    const [hx1, hy1] = polar(CX, CY, 155, hdeg);
    const [hx2, hy2] = polar(CX, CY, 149, hdeg);
    tg.appendChild(svgEl('line', {
      x1: hx1, y1: hy1, x2: hx2, y2: hy2,
      stroke: '#333', 'stroke-width': 1, 'stroke-linecap': 'round',
    }));
  }
  for (let h = 0; h < 12; h++) {
    const hr = h * 2;
    const [x, y] = polar(CX, CY, 122, h * 30);
    const t = svgEl('text', {
      x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: '#bbb', 'font-family': 'Helvetica Neue,Arial',
      'font-size': hr === 0 || hr === 12 ? '14' : '12.5', 'font-weight': '300',
    });
    t.textContent = hr;
    ng.appendChild(t);
  }
}

function _build12hFace(tg, ng) {
  for (let i = 0; i < 60; i++) {
    const isH = i % 5  === 0;
    const isQ = i % 15 === 0;
    const [x1, y1] = polar(CX, CY, 155, i * 6);
    const [x2, y2] = polar(CX, CY, isQ ? 139 : isH ? 144 : 149, i * 6);
    tg.appendChild(svgEl('line', {
      x1, y1, x2, y2,
      stroke: isH ? '#7a7a7a' : '#333',
      'stroke-width': isQ ? 2.5 : isH ? 1.5 : 1,
      'stroke-linecap': 'round',
    }));
  }
  for (let h = 1; h <= 12; h++) {
    const [x, y] = polar(CX, CY, 122, h * 30);
    const t = svgEl('text', {
      x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: '#bbb', 'font-family': 'Helvetica Neue,Arial',
      'font-size': h === 12 ? '16' : '14.5', 'font-weight': '300',
    });
    t.textContent = h;
    ng.appendChild(t);
  }
}

export function redraw() {
  ['gOuter', 'gInner', 'gHandles', 'gLabels', 'gBudget'].forEach(id => {
    document.getElementById(id).innerHTML = '';
  });

  const fit = getFitRange();
  document.getElementById('sep1').style.visibility = fit ? 'hidden' : '';
  document.getElementById('sep2').style.visibility = fit ? 'hidden' : '';
  if (fit) buildFace();

  if (!S.startTime || S.tasks.length === 0) return;

  const startAbs   = S.startTime.getHours() * 60 + S.startTime.getMinutes();
  const budgetMins = getBudgetMins();
  const budgetEnd  = startAbs + budgetMins;

  if (budgetMins !== Infinity) drawBudgetMarker(budgetEnd);

  taskTimings = [];
  let cursor = startAbs;
  S.tasks.forEach((task, i) => {
    const tStart = cursor;
    const tEnd   = cursor + task.duration;
    taskTimings.push({ startAbs: tStart, endAbs: tEnd });

    let normDur = task.duration, spillDur = 0;
    if (budgetMins !== Infinity) {
      if (tStart >= budgetEnd) {
        spillDur = task.duration; normDur = 0;
      } else if (tEnd > budgetEnd) {
        normDur  = budgetEnd - tStart;
        spillDur = task.duration - normDur;
      }
    }

    if (normDur  > 0) drawSpan(tStart,            normDur,  task.color, 1,    task.name, i);
    if (spillDur > 0) drawSpan(tStart + normDur, spillDur, '#e85555', 0.88, '⚠ ' + task.name, -1);

    if (i < S.tasks.length - 1) addHandle(tEnd, i);

    cursor = tEnd;
  });
}

function drawSpan(startAbs, dur, color, opacity, label, taskIdx) {
  const fit = getFitRange();
  if (fit) {
    const sDeg = (startAbs - fit.startAbs) / fit.span * 360 + GAP_DEG / 2;
    const eDeg = (startAbs + dur - fit.startAbs) / fit.span * 360 - GAP_DEG / 2;
    if (eDeg > sDeg) {
      const pathAttrs = { d: donutPath(OR_O, IR_I, sDeg, eDeg), fill: color, opacity };
      if (taskIdx >= 0) pathAttrs['data-ti'] = taskIdx;
      const path = svgEl('path', pathAttrs);
      const tip = svgEl('title');
      tip.textContent = label;
      path.appendChild(tip);
      document.getElementById('gOuter').appendChild(path);

      const sweep = eDeg - sDeg;
      if (sweep >= 12 && label && taskIdx >= 0) {
        _addLabel('gLabels', label, sDeg, sweep, OR_O, IR_I,
          sweep > 40 ? '10' : '8');
      }
    }
    return;
  }

  const cycle = getCycleMins();
  let rem = dur, pos = startAbs;
  while (rem > 0) {
    const lapN = Math.floor(pos / cycle);
    if (lapN > 1) break;

    const lapPos = pos % cycle;
    const lapEnd = (lapN + 1) * cycle;
    const seg    = Math.min(rem, lapEnd - pos);

    const sDeg = minsToAngle(lapPos) + GAP_DEG / 2;
    const eDeg = minsToAngle(lapPos + seg) - GAP_DEG / 2;
    if (eDeg > sDeg) {
      const [rO, rI] = lapN === 0 ? [OR_O, OR_I] : [IR_O, IR_I];
      const gId = lapN === 0 ? 'gOuter' : 'gInner';

      const pathAttrs = { d: donutPath(rO, rI, sDeg, eDeg), fill: color, opacity };
      if (taskIdx >= 0) pathAttrs['data-ti'] = taskIdx;
      const path = svgEl('path', pathAttrs);
      const tip = svgEl('title');
      tip.textContent = label;
      path.appendChild(tip);
      document.getElementById(gId).appendChild(path);

      const sweep = eDeg - sDeg;
      if (sweep >= 14 && label && taskIdx >= 0) {
        _addLabel('gLabels', label, sDeg, sweep, rO, rI,
          sweep > 40 ? '9' : '7.5');
      }
    }

    pos += seg; rem -= seg;
  }
}

function _addLabel(gId, label, sDeg, sweep, rO, rI, fontSize) {
  const midDeg = sDeg + sweep / 2;
  const midR   = (rO + rI) / 2;
  const [lx, ly] = polar(CX, CY, midR, midDeg);
  const rotDeg   = midDeg > 180 ? midDeg + 180 : midDeg;
  const maxCh    = sweep > 55 ? (fontSize === '10' ? 16 : 14) : sweep > 35 ? (fontSize === '10' ? 9 : 8) : 5;
  const txt      = label.length > maxCh ? label.slice(0, maxCh - 1) + '…' : label;
  const tEl = svgEl('text', {
    x: lx, y: ly,
    'text-anchor': 'middle', 'dominant-baseline': 'central',
    fill: 'rgba(255,255,255,0.85)', 'font-family': 'Helvetica Neue,Arial',
    'font-size': fontSize, 'font-weight': '500',
    transform: `rotate(${rotDeg},${lx},${ly})`,
    'pointer-events': 'none',
  });
  tEl.textContent = txt;
  document.getElementById(gId).appendChild(tEl);
}

function drawBudgetMarker(endAbs) {
  const fit = getFitRange();
  let deg, rO, rI;
  if (fit) {
    if (endAbs <= fit.startAbs || endAbs > fit.endAbs) return;
    deg = (endAbs - fit.startAbs) / fit.span * 360;
    rO = OR_O; rI = IR_I;
  } else {
    const cycle = getCycleMins();
    const lapN  = Math.floor(endAbs / cycle);
    if (lapN > 1) return;
    deg = minsToAngle(endAbs % cycle);
    [rO, rI] = lapN === 0 ? [OR_O, OR_I] : [IR_O, IR_I];
  }

  const [x1, y1] = polar(CX, CY, rI - 3, deg);
  const [x2, y2] = polar(CX, CY, rO + 3, deg);
  const g = document.getElementById('gBudget');
  g.appendChild(svgEl('line', {
    x1, y1, x2, y2,
    stroke: '#e85555', 'stroke-width': '2',
    'stroke-dasharray': '4 3', 'stroke-linecap': 'round',
  }));

  const [tx, ty] = polar(CX, CY, rO + 16, deg);
  const endTxt = svgEl('text', {
    x: tx, y: ty,
    'text-anchor': 'middle', 'dominant-baseline': 'central',
    fill: '#e85555', 'font-family': 'Helvetica Neue,Arial',
    'font-size': '8', 'font-weight': '600', 'letter-spacing': '.06em',
  });
  endTxt.textContent = 'END';
  g.appendChild(endTxt);
}

function addHandle(endAbs, taskIdx) {
  const fit = getFitRange();
  let deg, midR;
  if (fit) {
    deg  = (endAbs - fit.startAbs) / fit.span * 360;
    midR = (OR_O + IR_I) / 2;
  } else {
    const cycle = getCycleMins();
    const lapN  = Math.floor(endAbs / cycle);
    if (lapN > 1) return;
    deg  = minsToAngle(endAbs % cycle);
    midR = (lapN === 0 ? (OR_O + OR_I) : (IR_O + IR_I)) / 2;
  }

  const [hx, hy] = polar(CX, CY, midR, deg);
  const c = svgEl('circle', {
    cx: hx, cy: hy, r: 7,
    fill: 'white', stroke: '#111', 'stroke-width': 2,
    class: 'arc-handle', 'data-ti': taskIdx,
  });
  c.addEventListener('mousedown', e => beginDrag(e, taskIdx));
  c.addEventListener('touchstart', e => beginDrag(e, taskIdx), { passive: false });
  document.getElementById('gHandles').appendChild(c);
}

function beginDrag(e, taskIdx) {
  e.preventDefault();
  e.stopPropagation();
  drag = { taskIdx };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup',   endDrag);
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend',  endDrag);
}

function onDragMove(e) {
  if (!drag) return;
  e.preventDefault();

  const svg  = document.getElementById('clockSvg');
  const rect = svg.getBoundingClientRect();
  const px   = e.touches ? e.touches[0].clientX : e.clientX;
  const py   = e.touches ? e.touches[0].clientY : e.clientY;

  const svgScale = 500 / rect.width;
  const dx = (px - rect.left) * svgScale - CX;
  const dy = (py - rect.top)  * svgScale - CY;

  let deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  if (deg < 0) deg += 360;

  const startAbs = S.startTime.getHours() * 60 + S.startTime.getMinutes();
  let cursor = startAbs;
  for (let i = 0; i < drag.taskIdx; i++) cursor += S.tasks[i].duration;

  const fit = getFitRange();
  let newDur;
  if (fit) {
    const targetAbs = fit.startAbs + deg / 360 * fit.span;
    newDur = Math.round(Math.max(5, targetAbs - cursor) / 5) * 5;
  } else {
    const cycle       = getCycleMins();
    const targetMins  = deg / 360 * cycle;
    const taskStart12 = cursor % cycle;
    newDur = targetMins - taskStart12;
    if (newDur <= 0) newDur += cycle;
    newDur = Math.round(newDur / 5) * 5;
    newDur = Math.max(5, newDur);
  }

  const delta = newDur - S.tasks[drag.taskIdx].duration;
  if (delta === 0) return;

  const idx = drag.taskIdx;
  if (delta > 0) {
    let toTake = delta;
    for (let i = idx + 1; i < S.tasks.length && toTake > 0; i++) {
      const canTake = Math.max(0, S.tasks[i].duration - 5);
      const taken   = Math.min(toTake, canTake);
      S.tasks[i].duration -= taken;
      toTake -= taken;
    }
    if (toTake > 0) return;
  } else {
    if (idx + 1 < S.tasks.length) {
      S.tasks[idx + 1].duration += Math.abs(delta);
    }
  }

  S.tasks[idx].duration = newDur;
  save();
  if (onRedrawCallback) onRedrawCallback();
}

function endDrag() {
  drag = null;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup',   endDrag);
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('touchend',  endDrag);
}
