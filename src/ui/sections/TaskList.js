import { S, save } from '../../logic/state.js';
import { delTask, clearAllTasks, setColor, reorderTask } from '../../logic/tasks.js';
import { createTaskItem } from '../components/TaskItem.js';
import { toggleSection } from '../../logic/sections.js';
import { getActivePermissions } from '../../logic/sessions.js';

let dragIdx = null;

export function initTaskList({ onChanged }) {
  document.querySelector('.list-hd').addEventListener('click', () => toggleSection('tasks'));

  document.getElementById('btnClearAll').addEventListener('click', e => {
    e.stopPropagation();
    clearAllTasks();
    onChanged();
  });

  renderList(onChanged);
}

export function renderList(onChanged) {
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  const permissions = getActivePermissions();

  S.tasks.forEach((task, i) => {
    const wrap = createTaskItem(task, {
      onEdit:        id => onChanged({ openEdit: id }),
      onDelete:      id => { delTask(id); onChanged(); },
      onColorChange: (id, color) => { setColor(id, color); onChanged(); },
      onNameClick:   (itemEl, id) => startNameEdit(itemEl, id, onChanged),
      onChanged,
      permissions,
      onDragStart:   el => {
        dragIdx = i;
        setTimeout(() => el.classList.add('dragging'), 0);
      },
      onDragEnd:     el => {
        el.classList.remove('dragging');
        list.querySelectorAll('.drag-over').forEach(e => e.classList.remove('drag-over'));
      },
      onDragOver:    el => {
        list.querySelectorAll('.drag-over').forEach(e => e.classList.remove('drag-over'));
        el.classList.add('drag-over');
      },
      onDrop:        () => {
        if (dragIdx === null || dragIdx === i) return;
        reorderTask(dragIdx, i);
        dragIdx = null;
        renderList(onChanged);
        onChanged();
      },
    });
    wrap.dataset.i = i;
    list.appendChild(wrap);
  });
}

function startNameEdit(itemEl, taskId, onChanged) {
  if (itemEl.querySelector('.t-name-edit')) return;
  const task = S.tasks.find(t => t.id === taskId);
  if (!task) return;

  itemEl.draggable = false;
  const nameSpan = itemEl.querySelector('.t-name');
  const inp = document.createElement('input');
  inp.className = 't-name-edit';
  inp.type = 'text';
  inp.value = task.name;
  nameSpan.replaceWith(inp);
  inp.focus();
  inp.select();

  function commit() {
    const val = inp.value.trim();
    if (val) task.name = val;
    save();
    renderList(onChanged);
    onChanged();
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { inp.value = task.name; inp.blur(); }
  });
  inp.addEventListener('click', e => e.stopPropagation());
}

