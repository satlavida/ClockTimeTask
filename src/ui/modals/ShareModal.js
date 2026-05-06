import { listShareCodes, createShareCode, revokeShareCode, getActiveSession } from '../../logic/sessions.js';

const PRESETS = {
  view:         { label: 'View only',    permissions: ['view_tasks', 'view_notes'] },
  collaborator: { label: 'Collaborator', permissions: ['view_tasks', 'edit_tasks', 'reorder_tasks', 'view_notes', 'edit_notes'] },
  full:         { label: 'Full access',  permissions: ['view_tasks', 'edit_tasks', 'reorder_tasks', 'view_notes', 'edit_notes', 'edit_budget'] },
};

const PERM_LABELS = {
  view_tasks:    'View tasks',
  edit_tasks:    'Edit tasks',
  reorder_tasks: 'Reorder tasks',
  view_notes:    'View notes',
  edit_notes:    'Edit notes',
  edit_budget:   'Edit budget & start time',
  manage_share:  'Manage share codes',
};

export function initShareModal() {
  document.getElementById('shareOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('shareOverlay')) closeShareModal();
  });
  document.getElementById('btnCloseShare').addEventListener('click', closeShareModal);

  // Preset buttons
  Object.entries(PRESETS).forEach(([key, preset]) => {
    document.getElementById(`sharePreset-${key}`)?.addEventListener('click', () => {
      applyPreset(preset.permissions);
    });
  });

  document.getElementById('btnCreateShareCode').addEventListener('click', handleCreateCode);
  document.getElementById('btnCopyNewCode').addEventListener('click', () => copyText('newShareCodeValue'));
}

function applyPreset(permissions) {
  document.querySelectorAll('#sharePermChecks input[type=checkbox]').forEach(cb => {
    cb.checked = permissions.includes(cb.value) && cb.value !== 'manage_share';
  });
}

async function handleCreateCode() {
  const checked = [...document.querySelectorAll('#sharePermChecks input[type=checkbox]:checked')]
    .map(cb => cb.value);

  if (!checked.length) {
    showShareError('Select at least one permission.');
    return;
  }

  const btn = document.getElementById('btnCreateShareCode');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    const { shareCode } = await createShareCode(checked);
    document.getElementById('newShareCodeValue').value = shareCode;
    document.getElementById('newShareCodeRow').hidden  = false;
    await refreshCodeList();
  } catch (_) {
    showShareError('Could not create share code.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Link';
  }
}

async function refreshCodeList() {
  const container = document.getElementById('shareCodeList');
  container.innerHTML = '';

  try {
    const codes = await listShareCodes();
    const session = getActiveSession();

    codes.forEach(({ shareCode, permissions, createdAt }) => {
      const isOwn = shareCode === session?.shareCode;
      const row   = document.createElement('div');
      row.className = 'share-code-row';

      const info = document.createElement('div');
      info.className = 'share-code-info';

      const codeEl = document.createElement('div');
      codeEl.className = 'share-code-value';
      codeEl.textContent = shareCode;

      const permsEl = document.createElement('div');
      permsEl.className = 'share-code-perms';
      permsEl.textContent = permissions.map(p => PERM_LABELS[p] ?? p).join(', ');

      info.append(codeEl, permsEl);

      const actions = document.createElement('div');
      actions.className = 'share-code-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'share-code-copy';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(shareCode).catch(() => {});
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
      actions.appendChild(copyBtn);

      const linkBtn = document.createElement('button');
      linkBtn.className = 'share-code-copy';
      linkBtn.textContent = 'Copy Link';
      linkBtn.addEventListener('click', () => {
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('action', 'join');
        url.searchParams.set('id', session?.id ?? '');
        url.searchParams.set('code', shareCode);
        navigator.clipboard.writeText(url.toString()).catch(() => {});
        linkBtn.textContent = 'Copied!';
        setTimeout(() => { linkBtn.textContent = 'Copy Link'; }, 1500);
      });
      actions.appendChild(linkBtn);

      if (!isOwn) {
        const revokeBtn = document.createElement('button');
        revokeBtn.className = 'share-code-revoke';
        revokeBtn.textContent = 'Revoke';
        revokeBtn.addEventListener('click', async () => {
          if (!confirm('Revoke this share code? Anyone using it will lose access.')) return;
          try {
            await revokeShareCode(shareCode);
            await refreshCodeList();
          } catch (_) { showShareError('Could not revoke.'); }
        });
        actions.appendChild(revokeBtn);
      }

      row.append(info, actions);
      container.appendChild(row);
    });

    if (!codes.length) {
      container.innerHTML = '<div class="share-empty">No share codes yet.</div>';
    }
  } catch (_) {
    container.innerHTML = '<div class="share-empty">Could not load share codes.</div>';
  }
}

function showShareError(msg) {
  const el = document.getElementById('shareError');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

function copyText(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  navigator.clipboard.writeText(input.value).catch(() => {
    input.select();
    document.execCommand('copy');
  });
}

export async function openShareModal({ justCreated = false } = {}) {
  document.getElementById('newShareCodeRow').hidden  = true;
  document.getElementById('newShareCodeValue').value = '';
  applyPreset(PRESETS.collaborator.permissions);
  const err = document.getElementById('shareError');
  if (err) err.hidden = true;
  const banner = document.getElementById('shareCreatedBanner');
  if (banner) banner.hidden = !justCreated;

  const session = getActiveSession();
  const titleEl = document.querySelector('#shareOverlay .modal-title');
  if (titleEl) {
    titleEl.textContent = session?.name ? `Share — ${session.name}` : 'Share Session';
  }

  document.getElementById('shareOverlay').classList.add('open');
  await refreshCodeList();
}

export function closeShareModal() {
  document.getElementById('shareOverlay').classList.remove('open');
  const banner = document.getElementById('shareCreatedBanner');
  if (banner) banner.hidden = true;
}
