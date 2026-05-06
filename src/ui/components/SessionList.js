import { deleteCloudSession, getActiveSessionId, setActiveSession } from '../../logic/sessions.js';
import { load, save } from '../../logic/state.js';

/**
 * Renders a list of sessions into `container`.
 * callbacks: { onSwitch, onShare, onDelete }
 */
export function renderSessionList(container, sessions, { onSwitch, onShare, onDelete } = {}) {
  const activeId = getActiveSessionId();
  container.innerHTML = '';

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
          onShare?.(session);
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
        load();
        save();
        onDelete?.(session);
      });
      right.appendChild(delBtn);
    }

    item.append(left, right);

    item.addEventListener('click', e => {
      if (e.target.closest('.ss-item-action')) return;
      if (session.id === activeId) return;
      setActiveSession(session.id);
      load();
      onSwitch?.(session);
    });

    container.appendChild(item);
  });
}
