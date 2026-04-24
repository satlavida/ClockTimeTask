import { durStr } from '../../logic/time.js';

export function createTaskItem(task, { onEdit, onDelete, onColorChange, onNameClick, onDragStart, onDragEnd, onDragOver, onDrop }) {
  const div = document.createElement('div');
  div.className = 'task-item';
  div.draggable = true;
  div.innerHTML = `
    <span class="grip">⠿</span>
    <div class="swatch" style="background:${task.color}">
      <input type="color" value="${task.color}" />
    </div>
    <span class="t-name" title="${task.name}">${task.name}</span>
    <span class="t-dur">${durStr(task.duration)}</span>
    <button class="t-edit" title="Edit task">✎</button>
    <button class="t-del">×</button>
  `;

  div.querySelector('.t-name').addEventListener('click', e => {
    e.stopPropagation();
    onNameClick(div, task.id);
  });
  div.querySelector('input[type=color]').addEventListener('change', e => {
    onColorChange(task.id, e.target.value);
  });
  div.querySelector('.t-edit').addEventListener('click', () => onEdit(task.id));
  div.querySelector('.t-del').addEventListener('click', () => onDelete(task.id));

  div.addEventListener('dragstart', () => onDragStart(div));
  div.addEventListener('dragend',   () => onDragEnd(div));
  div.addEventListener('dragover',  e => { e.preventDefault(); onDragOver(div); });
  div.addEventListener('drop',      e => { e.preventDefault(); onDrop(div); });

  return div;
}
