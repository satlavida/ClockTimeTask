import { SEC_KEY } from './constants.js';

function loadSections() {
  try { return JSON.parse(localStorage.getItem(SEC_KEY) || '[]'); } catch (_) { return []; }
}

function saveSections(ids) {
  localStorage.setItem(SEC_KEY, JSON.stringify(ids));
}

export function toggleSection(id) {
  const els = document.querySelectorAll(`[data-sec="${id}"]`);
  if (!els.length) return;
  const collapsing = !els[0].classList.contains('collapsed');
  els.forEach(el => el.classList.toggle('collapsed', collapsing));
  const collapsed = [...new Set(
    [...document.querySelectorAll('[data-sec].collapsed')].map(e => e.dataset.sec),
  )];
  saveSections(collapsed);
}

export function initSections() {
  loadSections().forEach(id => {
    document.querySelectorAll(`[data-sec="${id}"]`).forEach(el => el.classList.add('collapsed'));
  });
}
