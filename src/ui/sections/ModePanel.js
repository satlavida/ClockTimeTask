import { S, save } from '../../logic/state.js';
import { toggleSection } from '../../logic/sections.js';

export function initModePanel({ onModeChange }) {
  const btnFree   = document.getElementById('btnFree');
  const btnBudget = document.getElementById('btnBudget');

  document.querySelector('[data-sec="mode"] .s-sec-hd')
    .addEventListener('click', () => toggleSection('mode'));

  btnFree.addEventListener('click',   () => setMode('free',   onModeChange));
  btnBudget.addEventListener('click', () => setMode('budget', onModeChange));
}

function setMode(m, onModeChange) {
  S.mode = m;
  document.getElementById('btnFree').classList.toggle('on', m === 'free');
  document.getElementById('btnBudget').classList.toggle('on', m === 'budget');
  document.getElementById('freePanel').classList.toggle('hide', m !== 'free');
  document.getElementById('budgetPanel').classList.toggle('hide', m !== 'budget');
  document.getElementById('sBudgetWrap').classList.toggle('hide', m !== 'budget');
  save();
  onModeChange();
}

export function syncModeUI() {
  const m = S.mode;
  document.getElementById('btnFree').classList.toggle('on', m === 'free');
  document.getElementById('btnBudget').classList.toggle('on', m === 'budget');
  document.getElementById('freePanel').classList.toggle('hide', m !== 'free');
  document.getElementById('budgetPanel').classList.toggle('hide', m !== 'budget');
  document.getElementById('sBudgetWrap').classList.toggle('hide', m !== 'budget');
}
