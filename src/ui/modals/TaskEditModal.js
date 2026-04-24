import { S } from '../../logic/state.js';
import { saveTaskEdit } from '../../logic/tasks.js';
import { absToTime } from '../../logic/time.js';

let editingTaskId = null;

export function initTaskEditModal({ onSaved }) {
  document.getElementById('taskEditOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('taskEditOverlay')) closeTaskEdit();
  });

  document.getElementById('btnCloseTaskEdit').addEventListener('click', closeTaskEdit);
  document.getElementById('btnCancelTaskEdit').addEventListener('click', closeTaskEdit);

  ['teHours', 'teMins'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateTaskEditTimes);
  });

  document.getElementById('btnSaveTaskEdit').addEventListener('click', () => {
    const task = S.tasks.find(t => t.id === editingTaskId);
    if (!task) return;
    const name = document.getElementById('teNameInput').value.trim();
    const h    = Math.max(0, parseInt(document.getElementById('teHours').value) || 0);
    const m    = Math.max(0, parseInt(document.getElementById('teMins').value)  || 0);
    saveTaskEdit(editingTaskId, name, h * 60 + m);
    onSaved();
    closeTaskEdit();
  });
}

export function openTaskEdit(id) {
  const task = S.tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;

  document.getElementById('teNameInput').value = task.name;
  document.getElementById('teHours').value = Math.floor(task.duration / 60);
  document.getElementById('teMins').value  = task.duration % 60;
  updateTaskEditTimes();

  document.getElementById('taskEditOverlay').classList.add('open');
  setTimeout(() => document.getElementById('teNameInput').focus(), 50);
}

export function closeTaskEdit() {
  editingTaskId = null;
  document.getElementById('taskEditOverlay').classList.remove('open');
}

function updateTaskEditTimes() {
  const h   = Math.max(0, parseInt(document.getElementById('teHours').value) || 0);
  const m   = Math.max(0, parseInt(document.getElementById('teMins').value)  || 0);
  const dur = h * 60 + m;

  const idx = S.tasks.findIndex(t => t.id === editingTaskId);
  let startAbs = S.startTime
    ? S.startTime.getHours() * 60 + S.startTime.getMinutes()
    : 0;
  for (let i = 0; i < idx && i < S.tasks.length; i++) {
    startAbs += S.tasks[i].duration;
  }

  document.getElementById('teStartVal').textContent = absToTime(startAbs);
  document.getElementById('teEndVal').textContent   = dur > 0 ? absToTime(startAbs + dur) : '—';
}
