import { createCloudSession, joinSession, setActiveSession, getSessions } from '../../logic/sessions.js';
import { toJSON, loadFromJSON, save } from '../../logic/state.js';
import { openShareModal } from './ShareModal.js';
import { renderSessionList } from '../components/SessionList.js';

let _onSessionChanged = null;
let _onUIRefresh      = null;
let _pendingLinkId    = null;
let _pendingLinkCode  = null;

export function initSessionModal({ onSessionChanged, onUIRefresh }) {
  _onSessionChanged = onSessionChanged;
  _onUIRefresh      = onUIRefresh;

  document.getElementById('sessionOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('sessionOverlay')) closeSessionModal();
  });

  document.getElementById('btnCloseSession').addEventListener('click', closeSessionModal);

  // View switcher
  document.getElementById('btnGoCreate').addEventListener('click', () => showView('create'));
  document.getElementById('btnGoJoin').addEventListener('click',   () => showView('join'));
  document.getElementById('btnBackCreate').addEventListener('click', () => showView('home'));
  document.getElementById('btnBackJoin').addEventListener('click',   () => showView('home'));

  // Create form
  document.getElementById('btnCreateSession').addEventListener('click', handleCreate);

  // Join form
  document.getElementById('btnDoJoin').addEventListener('click', handleJoin);

  // Link-join view
  document.getElementById('btnDoLinkJoin').addEventListener('click', handleLinkJoin);
  document.getElementById('btnLinkJoinCancel').addEventListener('click', () => {
    clearLinkParams();
    closeSessionModal();
  });
}

function showView(view) {
  ['home', 'create', 'join', 'link-join'].forEach(v => {
    document.getElementById(`sessionView-${v}`).classList.toggle('hidden', v !== view);
  });
  if (view === 'home') refreshHomeList();
  clearErrors();
}

function refreshHomeList() {
  const container = document.getElementById('sessionModalList');
  if (!container) return;
  const sessions = getSessions();
  renderSessionList(container, sessions, {
    onSwitch: () => { closeSessionModal(); _onSessionChanged?.(); },
    onShare:  (session) => {
      setActiveSession(session.id);
      closeSessionModal();
      openShareModal();
    },
    onDelete: () => { refreshHomeList(); _onSessionChanged?.(); },
  });
}

function clearErrors() {
  ['sessionCreateError', 'sessionJoinError', 'sessionLinkJoinError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.hidden = true; }
  });
}

function clearLinkParams() {
  _pendingLinkId   = null;
  _pendingLinkCode = null;
  history.replaceState(null, '', window.location.pathname);
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

async function handleCreate() {
  const name        = document.getElementById('sessionNameInput').value.trim() || 'My Session';
  const importState = document.getElementById('sessionImportToggle').checked;
  const btn         = document.getElementById('btnCreateSession');

  btn.disabled = true;
  btn.textContent = 'Creating…';
  clearErrors();

  try {
    const stateJSON = toJSON();
    const { sessionId } = await createCloudSession(name, stateJSON, importState);
    setActiveSession(sessionId);
    closeSessionModal();
    _onSessionChanged?.();
    openShareModal({ justCreated: true });
  } catch (err) {
    const msg = err.status === 429
      ? 'Server is at capacity. Try again later.'
      : 'Could not create session. Check your connection.';
    showError('sessionCreateError', msg);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Session';
  }
}

async function handleJoin() {
  const sessionId  = document.getElementById('joinSessionId').value.trim();
  const shareCode  = document.getElementById('joinShareCode').value.trim();
  const btn        = document.getElementById('btnDoJoin');

  if (!sessionId || !shareCode) {
    showError('sessionJoinError', 'Enter both a session ID and a share code.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Joining…';
  clearErrors();

  try {
    const { stateJSON } = await joinSession(sessionId, shareCode);
    setActiveSession(sessionId);
    loadFromJSON(stateJSON);
    save();
    closeSessionModal();
    _onSessionChanged?.();
  } catch (err) {
    const errors = {
      invalid_share_code: 'Invalid share code.',
      session_not_found:  'Session not found.',
    };
    showError('sessionJoinError', errors[err.message] ?? 'Could not join. Check your connection.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Join';
  }
}

async function handleLinkJoin() {
  const persist = document.getElementById('linkJoinSaveToggle').checked;
  const btn     = document.getElementById('btnDoLinkJoin');
  btn.disabled   = true;
  btn.textContent = 'Joining…';
  clearErrors();

  try {
    const { stateJSON } = await joinSession(_pendingLinkId, _pendingLinkCode, { persist });
    if (persist) {
      setActiveSession(_pendingLinkId);
      loadFromJSON(stateJSON);
      save();
      clearLinkParams();
      _onSessionChanged?.();
    } else {
      loadFromJSON(stateJSON);
      clearLinkParams();
      _onUIRefresh?.();
    }
    closeSessionModal();
  } catch (err) {
    const errors = {
      invalid_share_code: 'Invalid share code.',
      session_not_found:  'Session not found.',
    };
    showError('sessionLinkJoinError', errors[err.message] ?? 'Join failed. Check your link and try again.');
  } finally {
    btn.disabled   = false;
    btn.textContent = 'Join Session';
  }
}

export function openSessionModal() {
  showView('home');
  document.getElementById('sessionOverlay').classList.add('open');
}

export function openJoinLink(sessionId, shareCode) {
  _pendingLinkId   = sessionId;
  _pendingLinkCode = shareCode;
  showView('link-join');
  document.getElementById('sessionOverlay').classList.add('open');
}

export function closeSessionModal() {
  document.getElementById('sessionOverlay').classList.remove('open');
}
