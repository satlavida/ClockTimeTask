import './styles/main.css';
import { init } from './app.js';

const buildLabel = __BUILD_DATE__ === 'dev' ? 'dev' : new Date(Number(__BUILD_DATE__)).toISOString();
console.log(`[ClockTask] build ${buildLabel}`);

init();

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?v=${__BUILD_DATE__}`, { updateViaCache: 'none' })
      .catch(err => console.warn('[SW] registration failed:', err));
  });

  // When a new SW takes over (skipWaiting fired), reload to pick up fresh assets
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
