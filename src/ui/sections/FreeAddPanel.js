import { addFreeTask } from '../../logic/tasks.js';
import { toggleSection } from '../../logic/sections.js';

export function initFreeAddPanel({ onTaskAdded }) {
  document.querySelector('#freePanel .s-sec-hd')
    .addEventListener('click', () => toggleSection('add-task'));

  const submit = () => {
    const name  = document.getElementById('fName').value.trim();
    const hours = Math.max(0, parseInt(document.getElementById('fHours').value) || 0);
    const mins  = Math.max(0, parseInt(document.getElementById('fMins').value)  || 0);
    if (addFreeTask(name, hours, mins)) {
      document.getElementById('fName').value  = '';
      document.getElementById('fHours').value = '0';
      document.getElementById('fMins').value  = '30';
      onTaskAdded();
    }
  };

  document.getElementById('btnAddFree').addEventListener('click', submit);
  ['fName', 'fHours', 'fMins'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') submit();
    });
  });
}
