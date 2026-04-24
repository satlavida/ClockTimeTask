import { S } from '../../logic/state.js';
import { durStr, absToTime, getBudgetMins } from '../../logic/time.js';

export function updateStats() {
  const total = S.tasks.reduce((s, t) => s + t.duration, 0);
  document.getElementById('sTotal').textContent = total ? durStr(total) : '—';

  if (total > 0 && S.startTime) {
    const startAbs = S.startTime.getHours() * 60 + S.startTime.getMinutes();
    document.getElementById('sEnds').textContent = absToTime(startAbs + total);
  } else {
    document.getElementById('sEnds').textContent = '—';
  }

  if (S.mode === 'budget') {
    const budget = getBudgetMins();
    document.getElementById('sBudget').textContent = budget < Infinity ? durStr(budget) : '—';
    const over = total - budget;
    document.getElementById('sOverWrap').classList.toggle('hide', over <= 0);
    if (over > 0) document.getElementById('sOver').textContent = '+' + durStr(over);
  } else {
    document.getElementById('sOverWrap').classList.add('hide');
  }
}
