export function initPrivacyModal() {
  document.getElementById('privacyOverlay').addEventListener('click', e => {
    if (e.target.id === 'privacyOverlay') closePrivacy();
  });
  document.getElementById('btnClosePrivacy').addEventListener('click', closePrivacy);
  document.getElementById('btnPrivacyDismiss').addEventListener('click', closePrivacy);
}

export function openPrivacy() {
  document.getElementById('privacyOverlay').classList.add('open');
}

export function closePrivacy() {
  document.getElementById('privacyOverlay').classList.remove('open');
}
