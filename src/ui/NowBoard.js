import { S } from '../logic/state.js';
import { p2 } from '../logic/time.js';
import { playChime } from '../logic/sound.js';

let _prevTaskId = undefined;

function getCurrentTask() {
  if (!S.startTime || S.tasks.length === 0) return null;
  const now     = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const startAbs = S.startTime.getHours() * 60 + S.startTime.getMinutes();

  let cursor = startAbs;
  for (let i = 0; i < S.tasks.length; i++) {
    const tEnd = cursor + S.tasks[i].duration;
    if (nowMins >= cursor && nowMins < tEnd) {
      return {
        task:       S.tasks[i],
        endAbs:     tEnd,
        remSecs:    Math.max(0, (tEnd - nowMins) * 60),
        nextTask:   S.tasks[i + 1] || null,
        nextInMins: Math.ceil(tEnd - nowMins),
      };
    }
    cursor = tEnd;
  }
  return null;
}

export function updateBoard() {
  const info = getCurrentTask();

  const currentId = info?.task.id ?? null;
  if (_prevTaskId !== undefined && currentId !== _prevTaskId && S.settings.soundAlerts) {
    if (_prevTaskId !== null) playChime();
  }
  _prevTaskId = currentId;

  const liveEl  = document.getElementById('nbLive');
  const nameEl  = document.getElementById('nbName');
  const nextEl  = document.getElementById('nbNext');
  const remEl   = document.getElementById('nbRem');
  const remLbl  = document.getElementById('nbRemLbl');
  const remWrap = document.getElementById('nbRemWrap');

  if (!info) {
    liveEl.className = 'nb-live idle';
    liveEl.querySelector('.nb-live-dot').style.display = 'none';
    liveEl.lastChild.textContent = ' Idle';
    nameEl.textContent = 'No active task';
    nameEl.className   = 'nb-task-name empty';
    nextEl.style.visibility = 'hidden';
    remEl.textContent  = '';
    remLbl.textContent = '';
    return;
  }

  liveEl.className = 'nb-live';
  liveEl.querySelector('.nb-live-dot').style.display = '';
  liveEl.lastChild.textContent = ' Live';
  nameEl.textContent = info.task.name;
  nameEl.className   = 'nb-task-name';

  const showRem = S.settings.showTimeRemaining;
  remWrap.style.visibility = showRem ? 'visible' : 'hidden';
  if (showRem) {
    const rm = Math.floor(info.remSecs / 60);
    const rs = Math.floor(info.remSecs % 60);
    remEl.textContent  = rm > 0 ? `${rm}m ${p2(rs)}s` : `${p2(rs)}s`;
    remLbl.textContent = 'remaining';
  }

  if (info.nextTask) {
    nextEl.style.visibility = 'visible';
    document.getElementById('nbNextName').textContent = info.nextTask.name;
    document.getElementById('nbNextIn').textContent   = `· in ${info.nextInMins}m`;
  } else {
    nextEl.style.visibility = 'hidden';
  }
}
