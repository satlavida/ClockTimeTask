import { getSessions, getActiveSessionId, setActiveSession, deleteCloudSession } from '../../logic/sessions.js';
import { load, save } from '../../logic/state.js';

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
  list.innerHTML = '';

  sessions.forEach(session => {
    const item = document.createElement('div');
    item.className = `ss-item${session.id === activeId ? ' active' : ''}`;

    const left = document.createElement('div');
    left.className = 'ss-item-left';

    const dot = document.createElement('span');
    dot.className = `ss-dot ${session.type}`;

    const name = document.createElement('span');
    name.className = 'ss-item-name';
    name.textContent = session.name;

    left.append(dot, name);

    const right = document.createElement('div');
    right.className = 'ss-item-right';

    if (session.type === 'cloud') {
      if (session.permissions?.includes('manage_share')) {
        const shareBtn = document.createElement('button');
        shareBtn.className = 'ss-item-action';
        shareBtn.title = 'Manage share codes';
        shareBtn.textContent = '⇄';
        shareBtn.addEventListener('click', e => {
          e.stopPropagation();
          closeDrop();
          _onShare?.();
        });
        right.appendChild(shareBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.className = 'ss-item-action danger';
      delBtn.title = 'Remove session';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Remove "${session.name}" from this device?`)) return;
        await deleteCloudSession(session.id);
        syncSwitcher();
        if (getActiveSessionId() !== session.id) return;
        setActiveSession('local');
        load();
        save();
        _onSwitch?.();
      });
      right.appendChild(delBtn);
    }

    item.append(left, right);

    item.addEventListener('click', e => {
      if (e.target.closest('.ss-item-action')) return;
      if (session.id === activeId) { closeDrop(); return; }
      setActiveSession(session.id);
      load();
      closeDrop();
      _onSwitch?.();
    });

    list.appendChild(item);
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
