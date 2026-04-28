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
  if (dur >= 5) {
    if (task.subtasks?.length) scaleSubtasks(task, dur);
    task.duration = dur;
  }
  save();
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function addSubTask(taskId) {
  const task = S.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!task.subtasks || task.subtasks.length === 0) {
    const half = Math.max(5, Math.floor(task.duration / 2 / 5) * 5);
    task.subtasks = [
      { id: genId(), name: 'Part 1', duration: half },
      { id: genId(), name: 'Part 2', duration: task.duration - half },
    ];
  } else {
    const last = task.subtasks[task.subtasks.length - 1];
    const take = Math.max(5, Math.floor(last.duration / 2 / 5) * 5);
    if (last.duration - take < 5) return;
    last.duration -= take;
    task.subtasks.push({ id: genId(), name: `Part ${task.subtasks.length + 1}`, duration: take });
  }
  save();
}

export function delSubTask(taskId, subId) {
  const task = S.tasks.find(t => t.id === taskId);
  if (!task?.subtasks) return;
  const idx = task.subtasks.findIndex(s => s.id === subId);
  if (idx === -1) return;
  const removed = task.subtasks.splice(idx, 1)[0];
  if (task.subtasks.length === 0) {
    delete task.subtasks;
  } else {
    const last = task.subtasks[task.subtasks.length - 1];
    last.duration += removed.duration;
  }
  save();
}

export function saveSubTaskEdit(taskId, subId, name, dur) {
  const task = S.tasks.find(t => t.id === taskId);
  if (!task?.subtasks) return;
  const sub = task.subtasks.find(s => s.id === subId);
  if (!sub) return;
  if (name) sub.name = name;
  if (dur >= 5) {
    const others = task.subtasks.filter(s => s.id !== subId);
    sub.duration = Math.max(5, Math.min(dur, task.duration - others.length * 5));
    const last = task.subtasks[task.subtasks.length - 1];
    if (last.id !== subId) {
      const sumExceptLast = task.subtasks.reduce((a, s) => s.id === last.id ? a : a + s.duration, 0);
      last.duration = Math.max(5, task.duration - sumExceptLast);
    }
  }
  save();
}

export function scaleSubtasks(task, newDur) {
  if (!task.subtasks?.length) return;
  const oldDur = task.duration;
  if (oldDur === 0) return;
  let remaining = newDur;
  task.subtasks.forEach((s, i) => {
    if (i === task.subtasks.length - 1) {
      s.duration = Math.max(5, remaining);
    } else {
      s.duration = Math.max(5, Math.round(s.duration / oldDur * newDur / 5) * 5);
      remaining -= s.duration;
    }
  });
}
