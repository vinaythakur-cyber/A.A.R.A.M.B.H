import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, withRegion, formatIST } from '../../utils/api.js';
import { project, indiaPath } from './IndiaMap.jsx';
import { useLiveStats, useISTClock } from '../../hooks/useLive.js';
import { go } from '../../router.js';
import { IconArrowRight } from '../icons.jsx';
import Reveal from './Reveal.jsx';
import HeroLeafletMap from './HeroLeafletMap.jsx';
import LedTimer from '../LedTimer.jsx';

const SEV = {
  yellow: { color: '#facc15', r: 5 },
  orange: { color: '#fb923c', r: 6.5 },
  red: { color: '#ef4444', r: 8 },
  green: { color: '#22c55e', r: 4 },
};

function centroidOf(feature) {
  try {
    const ring = feature?.geometry?.coordinates?.[0];
    if (!ring || !ring.length) return null;
    let sx = 0, sy = 0;
    for (const [lo, la] of ring) { sx += lo; sy += la; }
    return project(sx / ring.length, sy / ring.length);
  } catch { return null; }
}

/** Fetch live hazard centroids across all regions (real API data). */
function useLiveCells(regions, updatedAt) {
  const [cells, setCells] = useState([]); // [] = loading, null = offline fallback
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const ids = (regions || []).map((r) => r.id);
        const res = await Promise.allSettled(
          ids.map((id) => apiFetch(withRegion('/api/hazards/latest', id))),
        );
        if (cancel) return;
        const out = [];
        res.forEach((r) => {
          if (r.status !== 'fulfilled') return;
          const feats = r.value?.features || [];
          for (const f of feats.slice(0, 90)) {
            const p = centroidOf(f);
            if (!p) continue;
            out.push({ x: p[0], y: p[1], sev: f.properties?.severity || 'yellow' });
            if (out.length >= 420) break;
          }
        });
        setCells(out.length ? out : null);
      } catch {
        if (!cancel) setCells(null);
      }
    })();
    return () => { cancel = true; };
  }, [regions, updatedAt]);
  return cells;
}

/** Cinematic canvas: India silhouette + drifting live storm cells. */
function StormCanvas({ cells }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0, h = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Pre-rendered glow sprites per severity (fast drawImage).
    const sprites = {};
    Object.entries(SEV).forEach(([k, v]) => {
      const s = document.createElement('canvas');
      s.width = s.height = 96;
      const c = s.getContext('2d');
      const g = c.createRadialGradient(48, 48, 2, 48, 48, 48);
      g.addColorStop(0, v.color);
      g.addColorStop(0.25, v.color + 'cc');
      g.addColorStop(1, v.color + '00');
      c.fillStyle = g;
      c.fillRect(0, 0, 96, 96);
      sprites[k] = s;
    });

    // Particles: live cells, or ambient drift when offline.
    const mk = () => {
      if (cells && cells.length) {
        return cells.map((c) => ({
          x: c.x, y: c.y, sev: SEV[c.sev] ? c.sev : 'yellow',
          vx: 0.55 + Math.random() * 0.7, vy: -(0.1 + Math.random() * 0.3),
          ph: Math.random() * Math.PI * 2, sp: 0.8 + Math.random() * 1.4,
          ping: Math.random() < 0.12 ? Math.random() * 6 : -1,
        }));
      }
      return Array.from({ length: 26 }, () => ({
        x: 8 + Math.random() * 84, y: 12 + Math.random() * 72,
        sev: ['yellow', 'orange', 'red'][Math.floor(Math.random() * 3)],
        vx: 0.5 + Math.random() * 0.6, vy: -(0.1 + Math.random() * 0.25),
        ph: Math.random() * Math.PI * 2, sp: 0.8 + Math.random() * 1.2,
        ping: -1,
      }));
    };
    let parts = mk();
    const cellsKey = (cells && cells.length) || 'ambient';

    const outline = indiaPath().split(' ').map((pt) => pt.split(',').map(Number));
    const fit = () => {
      const s = Math.min(w / 100, h / 100) * 0.94;
      return { s, ox: (w - 100 * s) / 2, oy: (h - 100 * s) / 2 };
    };

    let sweep = 0;
    let last = performance.now();
    const draw = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { s, ox, oy } = fit();
      const X = (x) => ox + x * s;
      const Y = (y) => oy + y * s;
      ctx.clearRect(0, 0, w, h);

      // India silhouette
      ctx.beginPath();
      outline.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(X(x), Y(y));
        else ctx.lineTo(X(x), Y(y));
      });
      ctx.closePath();
      const fg = ctx.createLinearGradient(0, 0, w, h);
      fg.addColorStop(0, 'rgba(56,189,248,0.07)');
      fg.addColorStop(1, 'rgba(129,140,248,0.04)');
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,130,255,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Soft radar sweep
      sweep += dt * 0.35;
      const cx = X(50), cy = Y(46), R = 62 * s;
      if (ctx.createConicGradient) {
        const cg = ctx.createConicGradient(sweep, cx, cy);
        cg.addColorStop(0, 'rgba(129,140,248,0.10)');
        cg.addColorStop(0.12, 'rgba(129,140,248,0)');
        cg.addColorStop(1, 'rgba(129,140,248,0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      }

      // Storm cells
      const t = now / 1000;
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x > 99) { p.x = 1; p.y = 8 + Math.random() * 80; }
        if (p.y < 1) p.y = 95;
        const meta = SEV[p.sev];
        const pulse = 1 + 0.28 * Math.sin(t * p.sp + p.ph);
        const rad = meta.r * pulse * s * 1.7;
        const alpha = 0.55 + 0.3 * Math.sin(t * p.sp * 0.7 + p.ph);
        ctx.globalAlpha = Math.max(0.15, alpha);
        const sz = rad * 3.2;
        ctx.drawImage(sprites[p.sev], X(p.x) - sz / 2, Y(p.y) - sz / 2, sz, sz);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = meta.color;
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), Math.max(1.4, rad * 0.32), 0, Math.PI * 2);
        ctx.fill();
        // Expanding ping on a few intense cells
        if (p.ping >= 0) {
          p.ping += dt * 14;
          if (p.ping > 26) p.ping = 0;
          ctx.globalAlpha = Math.max(0, 0.5 - p.ping / 52);
          ctx.strokeStyle = meta.color;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(X(p.x), Y(p.y), p.ping * s * 0.9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(cells && cells.length) || 'x']);

  return <canvas ref={ref} className="hero-canvas" aria-hidden="true" />;
}

export function Hero({ t, live }) {
  const { regions, cycles, online, updatedAt } = live;
  const stats = useLiveStats(cycles, regions);
  const cells = useLiveCells(regions, updatedAt);
  const clock = useISTClock();
  const sevName = { yellow: t.sevYellow, orange: t.sevOrange, red: t.sevRed, green: t.sevGreen }[stats.worst] || stats.worst;
  const lastCycle = useMemo(() => {
    let latest = null;
    Object.values(cycles).forEach((c) => {
      if (c?.valid_time && (!latest || c.valid_time > latest)) latest = c.valid_time;
    });
    return latest;
  }, [cycles]);

  const nextCycleInS = useMemo(() => {
    let minNext = null;
    Object.values(cycles).forEach((c) => {
      if (typeof c?.next_cycle_in_s === 'number') {
        if (minNext === null || c.next_cycle_in_s < minNext) minNext = c.next_cycle_in_s;
      }
    });
    return minNext ?? 300;
  }, [cycles]);

  return (
    <header className="hero">
      <div className="wrap">
        <Reveal>
          <div className="hero-kicker">
            <span className={`live-badge ${online ? '' : 'off'}`}>
              <span className="dot" />{online ? t.liveFeed : t.offline}
            </span>
            <strong style={{ letterSpacing: '0.05em', color: '#e0f2fe', fontWeight: 700 }}>A.A.R.A.M.B.H</strong>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>Atmospheric Analysis &amp; Rapid Alert Monitoring for Bursts &amp; Hazards</span>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <h1>
            {t.heroTitleA}<br />
            <span className="grad-text">{t.heroTitleB}</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="sub">{t.heroSub}</p>
        </Reveal>
        <Reveal delay={240}>
          <div className="hero-ctas">
            <button className="btn btn-primary" onClick={() => go('/app')}>
              {t.launchDemo} <IconArrowRight size={17} />
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => go('/relocation')}
              style={{ borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}
            >
              Relocation & Carrying Capacity <IconArrowRight size={17} />
            </button>
            <a className="btn btn-ghost" href="#proof">{t.seeProof}</a>
          </div>
        </Reveal>
        <Reveal delay={320}>
          <div className="hero-visual">
            <div className="hero-hud">
              <span className="hud-region">{t.allIndia}</span>
              <span>{t.lastCycle}: {formatIST(lastCycle)}</span>
            </div>
            <HeroLeafletMap regions={regions} worstSev={stats.worst} />
            <div className="hero-foot">
              <div className="hero-foot-metrics">
                <span>{t.activeCells}: <b>{online ? stats.cells : '—'}</b></span>
                <span>{t.regionsOnline}: <b>{online ? `${regions.length}/8` : '—'}</b></span>
                <span>{t.worstNow}: <b><span className="sev-dot" style={{ background: SEV[stats.worst].color }} />{sevName}</b></span>
              </div>
              <LedTimer
                nextInSeconds={nextCycleInS}
                onRefresh={live.refresh}
                size="sm"
                label="CYCLE UPDATE"
              />
            </div>
          </div>
        </Reveal>
      </div>
    </header>
  );
}

export function Ticker({ t, live }) {
  const { regions, cycles } = live;
  const stats = useLiveStats(cycles, regions);
  const items = useMemo(() => {
    const base = [
      { k: t.tkCells, v: stats.cells, grad: true },
      { k: t.tkResolution, v: '1 km' },
      { k: t.tkLead, v: '0–6 h' },
      { k: t.tkRefresh, v: '5 ' + t.minutes },
      { k: t.tkCsi, v: '+0.51' },
    ];
    const per = stats.perRegion.slice(0, 8).map((r) => ({
      k: r.name, v: r.total, grad: false,
    }));
    return [...base, ...per];
  }, [stats, t]);

  // One track holding the item set twice; translating -50% loops seamlessly.
  const doubled = [...items, ...items];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {doubled.map((it, i) => (
          <span className="ticker-item" key={i} aria-hidden={i >= items.length}>
            {it.grad ? <b className="grad-text">{it.v}</b> : <b>{it.v}</b>}
            {it.k}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LiveStrip({ t, lang, live }) {
  const { regions, cycles, online } = live;
  const stats = useLiveStats(cycles, regions);
  const openRegion = (id) => {
    try { sessionStorage.setItem('br_region', id); } catch { /* noop */ }
    go('/app');
  };
  return (
    <section className="section" id="live">
      <div className="wrap">
        <Reveal>
          <div className="section-head">
            <div className="eyebrow">{t.liveEyebrow}</div>
            <h2>{t.liveTitle}</h2>
            <p>{t.liveSub}</p>
          </div>
        </Reveal>
        {!online && (
          <div className="landing-offline">
            {t.offlineNote}
            <button onClick={live.refresh}>{t.retry}</button>
          </div>
        )}
        <div className="live-grid">
          {stats.perRegion.map((r, i) => (
            <Reveal key={r.id} delay={Math.min(i * 60, 360)}>
              <button className="region-card" onClick={() => openRegion(r.id)}>
                <span className="rc-top">
                  <span className="rc-name">{r.name}</span>
                  <span className="sev-dot" style={{ background: SEV[r.worst].color, margin: 0, width: 11, height: 11 }} />
                </span>
                <span className="rc-cells">{r.total}<small>{t.cells}</small></span>
                <span className="rc-meta">
                  {r.validTime ? formatIST(r.validTime) : '—'}
                  <span className="rc-go"><IconArrowRight size={14} /></span>
                </span>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
