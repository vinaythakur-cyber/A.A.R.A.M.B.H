import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import 'leaflet/dist/leaflet.css';
import './styles/tokens.css';
import './styles/landing.css';
import './styles/dashboard.css';

// Automatically unregister any legacy service workers & clear stale caches on localhost
// so regular reload always loads fresh without requiring Ctrl+Shift+R
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      reg.unregister();
    }
  });
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    });
  }
}

// Seed the hash route from the path so /app opens the dashboard cleanly.
(function seedRoute() {
  try {
    if (!window.location.hash) {
      const p = window.location.pathname.replace(/\/+$/, '');
      if (p === '/app' || p.endsWith('/app')) {
        window.location.replace(`${p}/#/app`);
      } else if (p === '/relocation' || p.endsWith('/relocation')) {
        window.location.replace(`${p}/#/relocation`);
      }
    }
  } catch {
    /* noop */
  }
})();

try {
  document.documentElement.lang = localStorage.getItem('br_lang') === 'hi' ? 'hi' : 'en';
} catch {
  /* noop */
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
