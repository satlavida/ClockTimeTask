import { getSessions, getActiveSessionId } from '../../logic/sessions.js';
import { renderSessionList } from './SessionList.js';

let _onSwitch  = null;
let _onNew     = null;
let _onJoin    = null;
let _onShare   = null;
let _dropOpen  = false;

export function initSessionSwitcher({ onSwitch, onNew, onJoin, onShare }) {
  _onSwitch = onSwitch;
  _onNew    = onNew;
  _onJoin   = onJoin;
  _onShare  = onShare;

  document.getElementById('btnSessionChip').addEventListener('click', toggleDrop);
  document.getElementById('btnNewSession').addEventListener('click', () => { closeDrop(); _onNew?.(); });
  document.getElementById('btnJoinSession').addEventListener('click', () => { closeDrop(); _onJoin?.(); });

  document.addEventListener('click', e => {
    if (_dropOpen && !document.getElementById('sessionSwitcher').contains(e.target)) {
      closeDrop();
    }
  });

  syncSwitcher();
}

export function syncSwitcher() {
  const sessions   = getSessions();
  const activeId   = getActiveSessionId();
  const active     = sessions.find(s => s.id === activeId) ?? sessions[0];

  // Update chip label
  const chip = document.getElementById('btnSessionChip');
  const dot  = chip.querySelector('.ss-dot');
  const lbl  = chip.querySelector('.ss-lbl');
  dot.className  = `ss-dot ${active.type}`;
  lbl.textContent = active.name;

  // Rebuild session list in dropdown
  const list = document.getElementById('sessionList');
  renderSessionList(list, sessions, {
    onSwitch: () => { closeDrop(); _onSwitch?.(); },
    onShare:  () => { closeDrop(); _onShare?.(); },
    onDelete: () => { syncSwitcher(); _onSwitch?.(); },
  });
}

function toggleDrop() {
  _dropOpen ? closeDrop() : openDrop();
}

function openDrop() {
  _dropOpen = true;
  syncSwitcher();
  document.getElementById('sessionDrop').classList.add('open');
}

function closeDrop() {
  _dropOpen = false;
  document.getElementById('sessionDrop').classList.remove('open');
}
