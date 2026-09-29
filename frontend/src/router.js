import { useEffect, useState } from 'react';

/** Minimal hash router. Routes: '#/' landing, '#/app' dashboard. */
export function useHashRoute() {
  const [hash, setHash] = useState(() =>
    typeof window !== 'undefined' ? window.location.hash || '#/' : '#/',
  );
  useEffect(() => {
    const onChange = () =>
      setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const path = (hash || '#/').replace(/^#/, '') || '/';
  if (path.startsWith('/relocation')) return '/relocation';
  if (path.startsWith('/app') || path.startsWith('/nowcast')) return '/app';
  return '/';
}

export function go(path) {
  window.location.hash = `#${path}`;
}
