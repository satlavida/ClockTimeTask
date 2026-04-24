import { S, save } from './state.js';
import { getBudgetMins } from './time.js';
import { PALETTE } from './constants.js';

export function addFreeTask(name, hours, mins) {
  const dur = hours * 60 + mins;
  if (dur < 5) return false;
  S.tasks.push({
    id:       Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name:     name || 'Task',
    duration: dur,
    color:    PALETTE[S.tasks.length % PALETTE.length],
  });
  save();
  return true;
}

export function applyBudget(count, names) {
  const total = getBudgetMins();
  const per   = total < Infinity ? Math.max(5, Math.floor(total / count / 5) * 5) : 30;
  S.tasks = Array.from({ length: count }, (_, i) => ({
    id:       S.tasks[i]?.id || `b${i}_${Date.now().toString(36)}`,
    name:     names[i] || `Task ${i + 1}`,
    duration: per,
    color:    S.tasks[i]?.color || PALETTE[i % PALETTE.length],
  }));
  save();
}

export function delTask(id) {
  S.tasks = S.tasks.filter(t => t.id !== id);
  save();
}

export function clearAllTasks() {
  if (S.tasks.length === 0) return;
  S.tasks = [];
  save();
}

export function setColor(id, color) {
  const t = S.tasks.find(t => t.id === id);
  if (t) { t.color = color; save(); }
}

export function reorderTask(fromIdx, toIdx) {
  const [item] = S.tasks.splice(fromIdx, 1);
  S.tasks.splice(toIdx, 0, item);
  save();
}

export function saveTaskEdit(id, name, dur) {
  const task = S.tasks.find(t => t.id === id);
  if (!task) return;
  if (name)    task.name = name;
  if (dur >= 5) task.duration = dur;
  save();
}
