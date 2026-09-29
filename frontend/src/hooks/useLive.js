import { useCallback, useEffect, useRef, useState } from 'react';
import {
  API_URL,
  apiFetch,
  withRegion,
  wsUrl,
  REGIONS_FALLBACK,
  formatIST,
} from '../utils/api.js';

export { formatIST, API_URL };

/**
 * Shared real-time data hook for the landing page.
 * - Loads /api/health + /api/regions once.
 * - Loads /api/cycle?region= for every region (hazard counts, last cycle).
 * - Refreshes on WS new_cycle (exponential backoff reconnect) + 60 s poll.
 */
export function useNowcastLive() {
  const [health, setHealth] = useState(null);
  const [regions, setRegions] = useState(REGIONS_FALLBACK);
  const [cycles, setCycles] = useState({}); // regionId -> cycle payload
  const [online, setOnline] = useState(false);
  const [wsUp, setWsUp] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const h = await apiFetch('/api/health');
      setHealth(h);
      const list = Array.isArray(h.regions) && h.regions.length ? h.regions : null;
      let regs = REGIONS_FALLBACK;
      if (!list) {
        try {
          const r = await apiFetch('/api/regions');
          if (Array.isArray(r) && r.length) regs = r;
        } catch { /* keep fallback */ }
      } else {
        // health only carries ids; try the full catalog for names/centers
        try {
          const r = await apiFetch('/api/regions');
          if (Array.isArray(r) && r.length) regs = r;
        } catch {
          regs = list.map((id) => REGIONS_FALLBACK.find((x) => x.id === id) || { id, name: id });
        }
      }
      setRegions(regs);
      const ids = regs.map((r) => r.id);
      const results = await Promise.allSettled(
        ids.map((id) => apiFetch(withRegion('/api/cycle', id))),
      );
      const next = {};
      results.forEach((res, i) => {
        if (res.status === 'fulfilled') next[ids[i]] = res.value;
      });
      setCycles(next);
      setOnline(true);
      setUpdatedAt(Date.now());
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [refresh]);

  // Live WebSocket with exponential backoff.
  useEffect(() => {
    let ws = null;
    let closed = false;
    let retryMs = 3000;
    const connect = () => {
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        schedule();
        return;
      }
      ws.onopen = () => {
        retryMs = 3000;
        setWsUp(true);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && (msg.event === 'new_cycle' || msg.type === 'new_cycle')) refresh();
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        setWsUp(false);
        if (!closed) schedule();
      };
      ws.onerror = () => {
        try { ws.close(); } catch { /* noop */ }
      };
    };
    const schedule = () => {
      if (closed) return;
      setTimeout(() => { if (!closed) connect(); }, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
    };
    connect();
    return () => {
      closed = true;
      try { ws && ws.close(); } catch { /* noop */ }
    };
  }, [refresh]);

  return { health, regions, cycles, online, wsUp, updatedAt, refresh };
}

/** Ticking IST clock string, e.g. "12:31:45 IST". */
export function useISTClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  try {
    return (
      new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'Asia/Kolkata',
      }).format(now) + ' IST'
    );
  } catch {
    return '';
  }
}

/** Aggregate stats for ticker/hero from per-region cycles. */
export function useLiveStats(cycles, regions) {
  let cells = 0;
  let worst = 'green';
  const order = { green: 0, yellow: 1, orange: 2, red: 3 };
  const perRegion = regions.map((r) => {
    const c = cycles[r.id];
    const counts = c?.hazard_counts || {};
    const total = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
    cells += total;
    let w = 'green';
    Object.keys(counts).forEach((s) => {
      if (counts[s] > 0 && order[s] > order[w]) w = s;
    });
    if (order[w] > order[worst]) worst = w;
    return { id: r.id, name: r.name || r.id, total, worst: w, validTime: c?.valid_time };
  });
  return { cells, worst, perRegion };
}

export { REGIONS_FALLBACK };
