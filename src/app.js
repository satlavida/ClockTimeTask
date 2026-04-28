import { S, load } from './logic/state.js';
import { initSections } from './logic/sections.js';

import { initModePanel, syncModeUI } from './ui/sections/ModePanel.js';
import { initStartTimePanel, syncStartInput } from './ui/sections/StartTimePanel.js';
import { initFreeAddPanel } from './ui/sections/FreeAddPanel.js';
import { initBudgetPanel, syncBudgetInputs } from './ui/sections/BudgetPanel.js';
import { initTaskList, renderList } from './ui/sections/TaskList.js';
import { updateStats } from './ui/sections/StatsFooter.js';

import { initSettingsModal, openSettings, closeSettings } from './ui/modals/SettingsModal.js';
import { initTaskEditModal, openTaskEdit, closeTaskEdit } from './ui/modals/TaskEditModal.js';

import { initClockSVG, buildFace, redraw, tickHands } from './ui/clock/ClockSVG.js';
import { initPopover } from './ui/clock/Popover.js';
import { updateBoard } from './ui/NowBoard.js';
import { initStickyNotes, renderNotes, addNoteAndRender, alignNotes, setNoteFilter } from './ui/StickyNotes.js';
import { downloadMarkdown } from './logic/export.js';

export function init() {
  load();

  if (!S.startTime) {
    S.startTime = new Date();
    S.startTime.setSeconds(0, 0);
  }

  // Called after any task/state change that requires full re-render
  function refresh(opts = {}) {
    renderList(refresh);
    redraw();
    updateStats();
    updateBoard();
    renderNotes();
    if (opts.openEdit) openTaskEdit(opts.openEdit);
  }

  // Settings changes that affect clock geometry
  function onSettingChanged(key) {
    if (key === 'clock24h' || key === 'fitClock') { buildFace(); redraw(); }
    updateBoard();
  }

  // Wire up all sections
  initModePanel({ onModeChange: refresh });
  syncModeUI();

  initStartTimePanel({ onStartChange: () => { redraw(); updateStats(); } });
  syncStartInput();

  initFreeAddPanel({ onTaskAdded: refresh });

  initBudgetPanel({ onBudgetApplied: refresh });
  syncBudgetInputs();

  initTaskList({ onChanged: refresh });

  initSettingsModal({ onSettingChanged });

  initTaskEditModal({ onSaved: refresh });

  initClockSVG({ onDragEnd: refresh });

  initPopover();

  document.getElementById('btnOpenSettings').addEventListener('click', openSettings);

  document.getElementById('btnAddNote').addEventListener('click', addNoteAndRender);
  document.getElementById('btnAlignNotes').addEventListener('click', alignNotes);
  document.getElementById('btnDownload').addEventListener('click', downloadMarkdown);
  document.getElementById('noteFilter').addEventListener('change', e => {
    setNoteFilter(e.target.value || null);
  });

  // Escape closes any open modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSettings(); closeTaskEdit(); }
  });

  initSections();
  buildFace();
  renderList(refresh);
  redraw();
  updateStats();

  // Sync settings toggles
  document.getElementById('setShowRem').checked     = S.settings.showTimeRemaining;
  document.getElementById('setClock24h').checked    = S.settings.clock24h    ?? false;
  document.getElementById('setFitClock').checked    = S.settings.fitClock    ?? false;
  document.getElementById('setSoundAlerts').checked = S.settings.soundAlerts ?? false;

  initStickyNotes({ getTasks: () => S.tasks });

  setInterval(() => { tickHands(); updateBoard(); }, 1000);
  tickHands();
  updateBoard();
}
