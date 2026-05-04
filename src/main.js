import './styles/main.css';
import { init } from './app.js';

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('[SW] registration failed:', err));
  });

  // When a new SW takes over (skipWaiting fired), reload to pick up fresh assets
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
