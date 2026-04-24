import { S } from '../../logic/state.js';
import { applyBudget } from '../../logic/tasks.js';
import { toggleSection } from '../../logic/sections.js';

export function initBudgetPanel({ onBudgetApplied }) {
  document.querySelector('#budgetPanel .s-sec-hd')
    .addEventListener('click', () => toggleSection('add-task'));

  document.getElementById('bBtnDur').addEventListener('click', () =>
    setBudgetInputMode('duration'));
  document.getElementById('bBtnEndTime').addEventListener('click', () =>
    setBudgetInputMode('endtime'));

  ['bHours', 'bMins', 'bEndTime', 'bCount'].forEach(id => {
    document.getElementById(id).addEventListener('input', syncBudgetUI);
  });

  document.getElementById('btnApplyBudget').addEventListener('click', () => {
    syncBudgetUI();
    const names = [...document.getElementById('budgetNames').querySelectorAll('input')]
      .map(i => i.value.trim());
    applyBudget(S.budget.count, names);
    onBudgetApplied();
  });
}

function setBudgetInputMode(mode) {
  S.budget.inputMode = mode;
  document.getElementById('bBtnDur').classList.toggle('on', mode === 'duration');
  document.getElementById('bBtnEndTime').classList.toggle('on', mode === 'endtime');
  document.getElementById('bDurInputs').classList.toggle('hide', mode !== 'duration');
  document.getElementById('bEndTimeInput').classList.toggle('hide', mode !== 'endtime');
}

function syncBudgetUI() {
  const h  = parseInt(document.getElementById('bHours').value) || 0;
  const m  = parseInt(document.getElementById('bMins').value)  || 0;
  const et = document.getElementById('bEndTime').value || null;
  const c  = Math.max(1, Math.min(12, parseInt(document.getElementById('bCount').value) || 1));
  S.budget = { ...S.budget, hours: h, mins: m, endTimeStr: et, count: c };

  const box = document.getElementById('budgetNames');
  while (box.children.length > c) box.lastChild.remove();
  while (box.children.length < c) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = `Task ${box.children.length + 1}`;
    box.appendChild(inp);
  }
}

export function syncBudgetInputs() {
  document.getElementById('bHours').value = S.budget.hours;
  document.getElementById('bMins').value  = S.budget.mins;
  document.getElementById('bCount').value = S.budget.count;
  setBudgetInputMode(S.budget.inputMode);
  if (S.budget.endTimeStr) {
    document.getElementById('bEndTime').value = S.budget.endTimeStr;
  }
  syncBudgetUI();
}

export { syncBudgetUI };
