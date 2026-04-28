import { S } from './state.js';
import { absToTime, durStr } from './time.js';
import { p2 } from './time.js';

function hhmm(d) {
  return p2(d.getHours()) + ':' + p2(d.getMinutes());
}

function dateLabel(d) {
  return d.toISOString().slice(0, 10);
}

function noteLine(text) {
  const lines = text.trim().split('\n');
  return lines.map((l, i) => (i === 0 ? `- ${l}` : `  ${l}`)).join('\n');
}

export function exportToMarkdown() {
  const out = [];
  const now = new Date();

  out.push(`# ClockTask Export — ${dateLabel(now)}`);
  out.push('');

  if (S.startTime) out.push(`**Session start:** ${hhmm(S.startTime)}`);

  const totalMins = S.tasks.reduce((s, t) => s + t.duration, 0);

  if (S.startTime && totalMins > 0) {
    const startAbs = S.startTime.getHours() * 60 + S.startTime.getMinutes();
    out.push(`**Session end:** ${absToTime(startAbs + totalMins)}`);
  }

  out.push(`**Total duration:** ${durStr(totalMins)}`);
  out.push(`**Mode:** ${S.mode === 'budget' ? 'Budget' : 'Free Add'}`);
  out.push('');
  out.push('---');
  out.push('');

  if (S.tasks.length > 0) {
    out.push('## Tasks');
    out.push('');

    let cursor = S.startTime
      ? S.startTime.getHours() * 60 + S.startTime.getMinutes()
      : 0;

    S.tasks.forEach((task, i) => {
      const taskStart = cursor;
      const taskEnd   = taskStart + task.duration;
      cursor = taskEnd;

      out.push(`### ${i + 1}. ${task.name}`);
      out.push(`**Time:** ${absToTime(taskStart)} – ${absToTime(taskEnd)} (${durStr(task.duration)})`);

      if (task.subtasks?.length) {
        out.push('');
        out.push('#### Subtasks');
        out.push('');
        out.push('| # | Name | Duration | Start | End |');
        out.push('|---|------|----------|-------|-----|');
        let sc = taskStart;
        task.subtasks.forEach((sub, j) => {
          const ss = sc, se = sc + sub.duration;
          sc = se;
          out.push(`| ${j + 1} | ${sub.name} | ${durStr(sub.duration)} | ${absToTime(ss)} | ${absToTime(se)} |`);
        });
      }

      const linked = S.notes.filter(n => n.taskId === task.id && n.text.trim());
      if (linked.length) {
        out.push('');
        out.push('#### Notes');
        out.push('');
        linked.forEach(n => out.push(noteLine(n.text)));
      }

      out.push('');
    });

    out.push('---');
    out.push('');
  }

  const unlinked = S.notes.filter(n => !n.taskId && n.text.trim());
  if (unlinked.length) {
    out.push('## Unlinked Notes');
    out.push('');
    unlinked.forEach(n => out.push(noteLine(n.text)));
    out.push('');
  }

  return out.join('\n');
}

export function downloadMarkdown() {
  const md   = exportToMarkdown();
  const blob = new Blob([md], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `clocktask-${dateLabel(new Date())}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
