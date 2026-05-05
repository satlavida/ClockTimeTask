// Up to 3 toasts stacked at top-right. Each toast has an optional action button.
// Usage: showToast('message', { type: 'error'|'warn'|'info', action: { label, onClick } })

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 6_000;

let _container = null;
const _active = [];

function getContainer() {
  if (_container) return _container;
  _container = document.createElement('div');
  _container.id = 'toastContainer';
  _container.className = 'toast-container';
  document.body.appendChild(_container);
  return _container;
}

export function showToast(message, { type = 'info', action = null, duration = AUTO_DISMISS_MS } = {}) {
  const container = getContainer();

  // Evict oldest if at cap
  if (_active.length >= MAX_TOASTS) dismiss(_active[0]);

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const msg = document.createElement('span');
  msg.className = 'toast-msg';
  msg.textContent = message;
  toast.appendChild(msg);

  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      action.onClick();
      dismiss(toast);
    });
    toast.appendChild(btn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => dismiss(toast));
  toast.appendChild(closeBtn);

  container.appendChild(toast);
  _active.push(toast);

  // Animate in
  requestAnimationFrame(() => toast.classList.add('toast-in'));

  const timer = setTimeout(() => dismiss(toast), duration);
  toast._dismissTimer = timer;

  return toast;
}

function dismiss(toast) {
  if (!toast.isConnected) return;
  clearTimeout(toast._dismissTimer);
  toast.classList.remove('toast-in');
  toast.classList.add('toast-out');
  toast.addEventListener('transitionend', () => {
    toast.remove();
    const idx = _active.indexOf(toast);
    if (idx >= 0) _active.splice(idx, 1);
  }, { once: true });
}
