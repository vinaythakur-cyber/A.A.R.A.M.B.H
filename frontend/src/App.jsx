import { Suspense, lazy, useEffect, useState } from 'react';
import Landing from './pages/Landing.jsx';
import { useHashRoute } from './router.js';
import { STRINGS } from './utils/i18n.js';

// Code-split: the dashboard (Leaflet) loads only when the user opens #/app,
// keeping the landing page light.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const RelocationDashboard = lazy(() => import('./pages/RelocationDashboard.jsx'));

function DashboardFallback() {
  return (
    <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="skel" style={{ width: 220, height: 18 }} />
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('br_lang') || 'en';
    } catch {
      return 'en';
    }
  });
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('br_theme') || 'light';
    } catch {
      return 'dark';
    }
  });
  const t = STRINGS[lang] || STRINGS.en;

  // Set theme attribute on root and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('br_theme', theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Landing scrolls; dashboard views lock to the viewport.
  useEffect(() => {
    document.body.classList.toggle('is-app', route === '/app' || route === '/relocation');
    window.scrollTo(0, 0);
  }, [route]);

  const handleLang = (l) => {
    setLang(l);
    try {
      localStorage.setItem('br_lang', l);
    } catch {
      /* noop */
    }
    document.documentElement.lang = l === 'hi' ? 'hi' : 'en';
  };

  if (route === '/relocation') {
    return (
      <Suspense fallback={<DashboardFallback />}>
        <RelocationDashboard
          lang={lang}
          onLang={handleLang}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
      </Suspense>
    );
  }

  if (route === '/app') {
    return (
      <Suspense fallback={<DashboardFallback />}>
        <Dashboard
          lang={lang}
          onLang={handleLang}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
      </Suspense>
    );
  }
  return (
    <Landing
      t={t}
      lang={lang}
      onLang={handleLang}
      theme={theme}
      onToggleTheme={handleToggleTheme}
    />
  );
}
