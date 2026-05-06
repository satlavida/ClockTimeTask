import { durStr } from '../../logic/time.js';
import { addSubTask, delSubTask, saveSubTaskEdit } from '../../logic/tasks.js';

export function createTaskItem(task, { onEdit, onDelete, onColorChange, onNameClick, onDragStart, onDragEnd, onDragOver, onDrop, onChanged, permissions = null }) {
  const canEdit    = !permissions || permissions.includes('edit_tasks');
  const canReorder = !permissions || permissions.includes('reorder_tasks');

  const wrapper = document.createElement('div');
  wrapper.className = 'task-item-wrap';

  const div = document.createElement('div');
  div.className = 'task-item';
  div.draggable = canReorder;
  const hasSubtasks = task.subtasks?.length > 0;
  div.innerHTML = `
    <span class="grip">⠿</span>
    <div class="swatch" style="background:${task.color}">
      <input type="color" value="${task.color}" />
    </div>
    <span class="t-name" title="${task.name}">${task.name}</span>
    <span class="t-dur">${durStr(task.duration)}</span>
    <button class="t-sub-toggle" title="Sub-tasks">${hasSubtasks ? '▾' : '▸'}</button>
    <button class="t-edit" title="Edit task">✎</button>
    <button class="t-del">×</button>
  `;

  if (!canReorder) {
    div.querySelector('.grip').style.visibility = 'hidden';
  }

  if (canEdit) {
    div.querySelector('.t-name').addEventListener('click', e => {
      e.stopPropagation();
      onNameClick(div, task.id);
    });
    div.querySelector('input[type=color]').addEventListener('change', e => {
      onColorChange(task.id, e.target.value);
    });
    div.querySelector('.t-edit').addEventListener('click', () => onEdit(task.id));
    div.querySelector('.t-del').addEventListener('click', () => onDelete(task.id));
  } else {
    div.querySelector('.t-edit').hidden = true;
    div.querySelector('.t-del').hidden = true;
    div.querySelector('input[type=color]').disabled = true;
    div.querySelector('.t-name').style.cursor = 'default';
  }

  if (canReorder) {
    div.addEventListener('dragstart', () => onDragStart(div));
    div.addEventListener('dragend',   () => onDragEnd(div));
    div.addEventListener('dragover',  e => { e.preventDefault(); onDragOver(div); });
    div.addEventListener('drop',      e => { e.preventDefault(); onDrop(div); });
  }

  const subPanel = document.createElement('div');
  subPanel.className = 'subtask-list' + (hasSubtasks ? '' : ' hide');
  _renderSubtasks(subPanel, task, onChanged, canEdit);

  div.querySelector('.t-sub-toggle').addEventListener('click', e => {
    e.stopPropagation();
    const nowHidden = subPanel.classList.toggle('hide');
    div.querySelector('.t-sub-toggle').textContent = nowHidden ? '▸' : '▾';
  });

  wrapper.dataset.taskId = task.id;
  wrapper.appendChild(div);
  wrapper.appendChild(subPanel);
  return wrapper;
}

function _renderSubtasks(panel, task, onChanged, canEdit = true) {
  panel.innerHTML = '';

  (task.subtasks || []).forEach((sub, idx) => {
    const row = document.createElement('div');
    row.className = 'subtask-item';
    row.innerHTML = `
      <span class="sub-name">${sub.name}</span>
      <span class="subtask-dur" title="${canEdit ? 'Click to edit duration' : ''}">${durStr(sub.duration)}</span>
      <button class="sub-del" title="Remove sub-task">×</button>
    `;

    if (canEdit) {
      row.querySelector('.sub-name').addEventListener('click', () => {
        _startSubNameEdit(row, task, sub, idx, onChanged);
      });

      row.querySelector('.subtask-dur').addEventListener('click', () => {
        _startSubDurEdit(row, task, sub, idx, onChanged);
      });

      row.querySelector('.sub-del').addEventListener('click', () => {
        delSubTask(task.id, sub.id);
        onChanged();
      });
    } else {
      row.querySelector('.sub-del').hidden = true;
      row.querySelector('.sub-name').style.cursor = 'default';
      row.querySelector('.subtask-dur').style.cursor = 'default';
    }

    panel.appendChild(row);
  });

  if (canEdit) {
    const addRow = document.createElement('button');
    addRow.className = 'sub-add-btn';
    addRow.textContent = '+ add sub-task';
    addRow.addEventListener('click', () => {
      addSubTask(task.id);
      onChanged();
    });
    panel.appendChild(addRow);
  }
}

function _focusNextSubtask(taskId, nextIdx, field) {
  setTimeout(() => {
    const wrap = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!wrap) return;
    const rows = wrap.querySelectorAll('.subtask-item');
    const next = rows[nextIdx];
    if (next) next.querySelector(field)?.click();
  }, 0);
}

function _startSubNameEdit(row, task, sub, idx, onChanged) {
  if (row.querySelector('.sub-name-edit')) return;
  const nameSpan = row.querySelector('.sub-name');
  const inp = document.createElement('input');
  inp.className = 'sub-name-edit';
  inp.type = 'text';
  inp.value = sub.name;
  nameSpan.replaceWith(inp);
  inp.focus(); inp.select();

  let advance = false;
  function commit() {
    const val = inp.value.trim();
    saveSubTaskEdit(task.id, sub.id, val || sub.name, null);
    onChanged();
    if (advance) _focusNextSubtask(task.id, idx + 1, '.sub-name');
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); advance = true; inp.blur(); }
    if (e.key === 'Escape') { inp.value = sub.name; inp.blur(); }
  });
  inp.addEventListener('click', e => e.stopPropagation());
}

function _startSubDurEdit(row, task, sub, idx, onChanged) {
  if (row.querySelector('.sub-dur-edit')) return;
  const durSpan = row.querySelector('.subtask-dur');
  const inp = document.createElement('input');
  inp.className = 'sub-dur-edit';
  inp.type = 'number';
  inp.min = 5; inp.step = 5;
  inp.value = sub.duration;
  inp.title = 'Minutes';
  durSpan.replaceWith(inp);
  inp.focus(); inp.select();

  let advance = false;
  function commit() {
    const val = parseInt(inp.value) || sub.duration;
    saveSubTaskEdit(task.id, sub.id, null, val);
    onChanged();
    if (advance) _focusNextSubtask(task.id, idx + 1, '.subtask-dur');
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); advance = true; inp.blur(); }
    if (e.key === 'Escape') { inp.value = sub.duration; inp.blur(); }
  });
  inp.addEventListener('click', e => e.stopPropagation());
}
