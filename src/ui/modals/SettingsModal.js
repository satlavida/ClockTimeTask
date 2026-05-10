import { S, save } from '../../logic/state.js';
import { playChime } from '../../logic/sound.js';

export function initSettingsModal({ onSettingChanged }) {
  document.getElementById('settingsOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('settingsOverlay')) closeSettings();
  });

  document.getElementById('btnCloseSettings').addEventListener('click', closeSettings);

  document.getElementById('setClock24h').addEventListener('change', e => {
    applySetting('clock24h', e.target.checked, onSettingChanged);
  });
  document.getElementById('setFitClock').addEventListener('change', e => {
    applySetting('fitClock', e.target.checked, onSettingChanged);
  });
  document.getElementById('setShowRem').addEventListener('change', e => {
    applySetting('showTimeRemaining', e.target.checked, onSettingChanged);
  });
  document.getElementById('setSoundAlerts').addEventListener('change', e => {
    applySetting('soundAlerts', e.target.checked, onSettingChanged);
  });
  document.getElementById('setLinearView').addEventListener('change', e => {
    applySetting('linearView', e.target.checked, onSettingChanged);
  });

  document.getElementById('btnTestSound').addEventListener('click', playChime);
}

function applySetting(key, value, onSettingChanged) {
  S.settings[key] = value;
  save();
  onSettingChanged(key);
}

export function openSettings() {
  document.getElementById('setShowRem').checked     = S.settings.showTimeRemaining;
  document.getElementById('setClock24h').checked    = S.settings.clock24h    ?? false;
  document.getElementById('setFitClock').checked    = S.settings.fitClock    ?? false;
  document.getElementById('setSoundAlerts').checked = S.settings.soundAlerts ?? false;
  document.getElementById('setLinearView').checked  = S.settings.linearView  ?? false;
  const label = __BUILD_DATE__ === 'dev' ? 'dev' : new Date(Number(__BUILD_DATE__)).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  document.getElementById('buildVersion').textContent = `build ${label}`;
  document.getElementById('settingsOverlay').classList.add('open');
}

export function closeSettings() {
  document.getElementById('settingsOverlay').classList.remove('open');
}
