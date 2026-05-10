import { S, load, save } from './logic/state.js';
import { getActivePermissions, isCloudSession, getSessions } from './logic/sessions.js';
import { initSections } from './logic/sections.js';

import { initModePanel, syncModeUI } from './ui/sections/ModePanel.js';
import { initStartTimePanel, syncStartInput } from './ui/sections/StartTimePanel.js';
import { initFreeAddPanel } from './ui/sections/FreeAddPanel.js';
import { initBudgetPanel, syncBudgetInputs } from './ui/sections/BudgetPanel.js';
import { initTaskList, renderList } from './ui/sections/TaskList.js';
import { updateStats } from './ui/sections/StatsFooter.js';

import { initSettingsModal, openSettings, closeSettings } from './ui/modals/SettingsModal.js';
import { initTaskEditModal, openTaskEdit, closeTaskEdit } from './ui/modals/TaskEditModal.js';
import { initPrivacyModal, openPrivacy, closePrivacy } from './ui/modals/PrivacyModal.js';
import { initSessionModal, openSessionModal, closeSessionModal, openJoinLink } from './ui/modals/SessionModal.js';
import { initShareModal, openShareModal, closeShareModal } from './ui/modals/ShareModal.js';

import { initClockSVG, buildFace, redraw, tickHands } from './ui/clock/ClockSVG.js';
import { initPopover } from './ui/clock/Popover.js';
import { updateBoard } from './ui/NowBoard.js';
import { initStickyNotes, renderNotes, addNoteAndRender, alignNotes, setNoteFilter } from './ui/StickyNotes.js';
import { initLinearTicker, renderTicker } from './ui/LinearTicker.js';
import { downloadMarkdown } from './logic/export.js';

import { initSessionSwitcher, syncSwitcher } from './ui/components/SessionSwitcher.js';
import { initSyncStatus, schedulePush, forceSync, refreshSyncDisplay, syncConnection } from './ui/components/SyncStatus.js';

export function init() {
  load();

  if (!S.startTime) {
    S.startTime = new Date();
    S.startTime.setSeconds(0, 0);
  }

  function applyPermissions() {
    const perms = getActivePermissions();
    document.querySelectorAll('[data-perm]').forEach(el => {
      el.hidden = !perms.includes(el.dataset.perm);
    });
    const permHint = document.getElementById('sidebarPermHint');
    if (permHint) {
      permHint.hidden = !(isCloudSession() && !perms.includes('edit_tasks'));
    }
  }

  // Called after any task/state change that requires full re-render
  function refresh(opts = {}) {
    renderList(refresh);
    redraw();
    updateStats();
    updateBoard();
    renderNotes();
    renderTicker();
    applyPermissions();
    if (opts.openEdit) openTaskEdit(opts.openEdit);
    schedulePush();
  }

  // Called when active session is switched or remote state loaded
  function onSessionSwitch() {
    load();
    if (!S.startTime) { S.startTime = new Date(); S.startTime.setSeconds(0, 0); }
    syncModeUI();
    syncStartInput();
    syncBudgetInputs();
    refresh();
    syncSwitcher();
    refreshSyncDisplay();
    syncConnection();
  }

  function applyViewMode() {
    const linear = S.settings.linearView;
    document.querySelector('.clock-wrap').hidden   = linear;
    document.getElementById('notesLayer').hidden   = linear;
    document.getElementById('linearTicker').hidden = !linear;
    if (!linear) { buildFace(); redraw(); }
  }

  // Settings changes that affect clock geometry
  function onSettingChanged(key) {
    if (key === 'clock24h' || key === 'fitClock') { buildFace(); redraw(); }
    if (key === 'linearView') applyViewMode();
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

  initPrivacyModal();

  initSessionModal({
    onSessionChanged: onSessionSwitch,
    onUIRefresh: () => {
      if (!S.startTime) { S.startTime = new Date(); S.startTime.setSeconds(0, 0); }
      syncModeUI(); syncStartInput(); syncBudgetInputs();
      refresh(); syncSwitcher(); refreshSyncDisplay();
    },
  });

  initShareModal();

  initSessionSwitcher({
    onSwitch: onSessionSwitch,
    onNew:    () => { openSessionModal(); document.getElementById('btnGoCreate')?.click(); },
    onJoin:   () => { openSessionModal(); document.getElementById('btnGoJoin')?.click(); },
    onShare:  openShareModal,
  });

  initSyncStatus({ onStateUpdated: onSessionSwitch });

  document.getElementById('btnForceSync')?.addEventListener('click', forceSync);

  initClockSVG({ onDragEnd: refresh });

  initPopover();

  document.getElementById('btnSidebarToggle')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    const isOpen  = sidebar.classList.toggle('sidebar--open');
    document.getElementById('btnSidebarToggle').setAttribute('aria-expanded', String(isOpen));
  });

  document.getElementById('btnOpenSettings').addEventListener('click', openSettings);
  document.getElementById('btnOpenPrivacy').addEventListener('click', openPrivacy);
  document.getElementById('btnOpenSession').addEventListener('click', openSessionModal);

  document.getElementById('btnAddNote').addEventListener('click', addNoteAndRender);
  document.getElementById('btnAlignNotes').addEventListener('click', alignNotes);
  document.getElementById('btnDownload').addEventListener('click', downloadMarkdown);
  document.getElementById('noteFilter').addEventListener('change', e => {
    setNoteFilter(e.target.value || null);
  });

  // Escape closes any open modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeSettings(); closeTaskEdit(); closePrivacy();
      closeSessionModal(); closeShareModal();
    }
  });

  initSections();
  buildFace();
  renderList(refresh);
  redraw();
  updateStats();
  applyPermissions();

  // Sync settings toggles
  document.getElementById('setShowRem').checked     = S.settings.showTimeRemaining;
  document.getElementById('setClock24h').checked    = S.settings.clock24h    ?? false;
  document.getElementById('setFitClock').checked    = S.settings.fitClock    ?? false;
  document.getElementById('setSoundAlerts').checked = S.settings.soundAlerts ?? false;

  initStickyNotes({ getTasks: () => S.tasks });

  document.getElementById('setLinearView').checked = S.settings.linearView ?? false;
  initLinearTicker({ onTaskEdit: id => refresh({ openEdit: id }) });
  applyViewMode();

  syncSwitcher();
  refreshSyncDisplay();

  setInterval(() => {
    if (!S.settings.linearView) tickHands();
    updateBoard();
    renderTicker();
  }, 1000);
  tickHands();
  updateBoard();

  const _params = new URLSearchParams(window.location.search);
  if (_params.get('action') === 'join') {
    const _id   = _params.get('id');
    const _code = _params.get('code');
    if (_id && _code) setTimeout(() => openJoinLink(_id, _code), 0);
  }
}
