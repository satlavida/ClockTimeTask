import { S, save } from '../logic/state.js';
import { addNote, delNote, updateNoteText, updateNoteTask, moveNote } from '../logic/notes.js';

let layer = null;
let filterTaskId = null;
let getTaskList = () => [];

export function initStickyNotes({ getTasks }) {
  getTaskList = getTasks;
  layer = document.getElementById('notesLayer');
  renderNotes();
}

export function renderNotes() {
  if (!layer) return;
  layer.innerHTML = '';

  const visible = filterTaskId
    ? S.notes.filter(n => n.taskId === filterTaskId)
    : S.notes;

  visible.forEach(note => layer.appendChild(_createNoteEl(note)));
  _syncFilterSelect();
}

export function setNoteFilter(taskId) {
  filterTaskId = taskId || null;
  renderNotes();
}

export function addNoteAndRender() {
  const GRID = 20;
  const nowBoard = document.getElementById('nowBoard');
  const layerRect = layer.getBoundingClientRect();
  const boardRect = nowBoard ? nowBoard.getBoundingClientRect() : { bottom: 0 };
  const topOffset = Math.round((boardRect.bottom - layerRect.top + 16) / GRID) * GRID;
  const x = Math.round((layerRect.width / 2 - 100) / GRID) * GRID;
  addNote(filterTaskId, Math.max(GRID, x), topOffset);
  renderNotes();
}

export function alignNotes() {
  const GRID = 20;
  const nowBoard = document.getElementById('nowBoard');
  const layerRect = layer.getBoundingClientRect();
  const boardRect = nowBoard ? nowBoard.getBoundingClientRect() : { bottom: 0 };
  const topOffset = Math.round((boardRect.bottom - layerRect.top + 16) / GRID) * GRID;
  S.notes.forEach((n, i) => {
    n.x = Math.round((40 + i * 24) / GRID) * GRID;
    n.y = topOffset + Math.round((i * 24) / GRID) * GRID;
  });
  save();
  renderNotes();
}

function _createNoteEl(note) {
  const el = document.createElement('div');
  el.className = 'sticky-note';
  el.style.left = note.x + 'px';
  el.style.top  = note.y + 'px';

  const tasks = getTaskList();
  const taskOptions = tasks.map(t =>
    `<option value="${t.id}" ${note.taskId === t.id ? 'selected' : ''}>${_esc(t.name)}</option>`
  ).join('');

  const task = tasks.find(t => t.id === note.taskId);
  if (task) el.style.setProperty('--note-accent', task.color);

  el.innerHTML = `
    <div class="note-header">
      <span class="note-drag-handle" title="Drag to move">⠿</span>
      <select class="note-task-select">
        <option value="" ${!note.taskId ? 'selected' : ''}>Untagged</option>
        ${taskOptions}
      </select>
      <button class="note-close" title="Delete note">×</button>
    </div>
    <textarea class="note-body" placeholder="Note…">${_esc(note.text)}</textarea>
  `;

  el.querySelector('.note-task-select').addEventListener('change', e => {
    updateNoteTask(note.id, e.target.value || null);
    renderNotes();
  });

  el.querySelector('.note-close').addEventListener('click', () => {
    delNote(note.id);
    renderNotes();
  });

  el.querySelector('.note-body').addEventListener('input', e => {
    updateNoteText(note.id, e.target.value);
  });

  el.querySelector('.note-drag-handle').addEventListener('pointerdown', e => _beginDrag(e, el, note));

  return el;
}

function _beginDrag(e, el, note) {
  e.preventDefault();
  el.classList.add('dragging');

  const startX = e.clientX - note.x;
  const startY = e.clientY - note.y;

  function onMove(ev) {
    const rect = layer.getBoundingClientRect();
    let x = ev.clientX - startX;
    let y = ev.clientY - startY;
    x = Math.max(0, Math.min(x, rect.width  - 210));
    y = Math.max(0, Math.min(y, rect.height - 160));
    note.x = x; note.y = y;
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
  }

  function onUp() {
    el.classList.remove('dragging');
    moveNote(note.id, note.x, note.y);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup',   onUp);
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup',   onUp);
}

function _syncFilterSelect() {
  const sel = document.getElementById('noteFilter');
  if (!sel) return;
  const cur = sel.value;
  const tasks = getTaskList();
  sel.innerHTML = '<option value="">All notes</option>' +
    tasks.map(t => `<option value="${t.id}">${_esc(t.name)}</option>`).join('');
  sel.value = cur;
}

function _esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
