import { S, save } from './state.js';

function genId() {
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function addNote(taskId = null, x = 60, y = 60) {
  const note = { id: genId(), text: '', taskId, x, y };
  S.notes.push(note);
  save();
  return note.id;
}

export function delNote(id) {
  S.notes = S.notes.filter(n => n.id !== id);
  save();
}

export function updateNoteText(id, text) {
  const note = S.notes.find(n => n.id === id);
  if (note) { note.text = text; save(); }
}

export function updateNoteTask(id, taskId) {
  const note = S.notes.find(n => n.id === id);
  if (note) { note.taskId = taskId || null; save(); }
}

export function moveNote(id, x, y) {
  const note = S.notes.find(n => n.id === id);
  if (note) { note.x = x; note.y = y; save(); }
}
