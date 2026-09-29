import React, { useState } from 'react';
import { HAZARD_ICON, IconArrowRight, IconRadar, IconWind, IconAlert, IconBell, IconCheck } from '../icons.jsx';
import { REGIONS_FALLBACK } from '../../utils/api.js';
import { useLiveStats } from '../../hooks/useLive.js';
import { go } from '../../router.js';
import CoverageLeafletMap from './CoverageLeafletMap.jsx';
import Reveal from './Reveal.jsx';

/* ---------- Four hazard heads as product cards ---------- */
const HAZARDS = [
  { key: 'hz1', color: '#facc15', glow: 'rgba(250,204,21,0.14)', bg: 'rgba(250,204,21,0.10)' },
  { key: 'hz2', color: '#7dd3fc', glow: 'rgba(125,211,252,0.14)', bg: 'rgba(125,211,252,0.10)' },
  { key: 'hz3', color: '#fb923c', glow: 'rgba(251,146,60,0.14)', bg: 'rgba(251,146,60,0.10)' },
  { key: 'hz4', color: '#38bdf8', glow: 'rgba(56,189,248,0.16)', bg: 'rgba(56,189,248,0.10)' },
];
const HAZARD_ICON_KEYS = ['lightning', 'hail', 'downburst', 'cloudburst'];

export function HazardCards({ t }) {
  return (
    <section className="section" id="hazards">
      <div className="wrap">
        <Reveal>
          <div className="section-head">
            <div className="eyebrow">{t.hzEyebrow}</div>
            <h2>{t.hzTitle}</h2>
            <p>{t.hzSub}</p>
          </div>
        </Reveal>
        <div className="hazard-grid">
          {HAZARDS.map((h, i) => {
            const Icon = HAZARD_ICON[HAZARD_ICON_KEYS[i]];
            return (
              <Reveal key={h.key} delay={i * 90}>
                <div
                  className="hazard-card"
                  style={{ '--hc-glow': h.glow, '--hc-bg': h.bg, '--hc-color': h.color }}
                >
                  <div className="hc-icon"><Icon size={24} /></div>
                  <h3>{t[`${h.key}T`]}</h3>
                  <p>{t[`${h.key}D`]}</p>
                  <div className="hc-stat">
                    <b style={{ color: h.color }}>{t[`${h.key}S`]}</b>
                    <span>{t[`${h.key}M`]}</span>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- Ingest → nowcast → alert pipeline ---------- */
const STEPS = [
  { key: 'st1', Icon: IconRadar },
  { key: 'st2', Icon: IconWind },
  { key: 'st3', Icon: IconAlert },
  { key: 'st4', Icon: IconBell },
];

export function HowItWorks({ t }) {
  return (
    <section className="section" id="how">
      <div className="wrap">
        <Reveal>
          <div className="section-head">
            <div className="eyebrow">{t.howEyebrow}</div>
            <h2>{t.howTitle}</h2>
            <p>{t.howSub}</p>
          </div>
        </Reveal>
        <div className="pipeline">
          {STEPS.map((s, i) => (
            <Reveal key={s.key} delay={i * 100}>
              <div className="pipe-step">
                <span className="pipe-n">0{i + 1}</span>
                <div className="pipe-ic"><s.Icon size={22} /></div>
                <h3>{t[`${s.key}T`]}</h3>
                <p>{t[`${s.key}D`]}</p>
                <div className="pipe-meta">{t[`${s.key}M`]}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 8-metro showcase ---------- */
export function Regions({ t, live }) {
  const { regions, cycles } = live;
  const stats = useLiveStats(cycles, regions);
  const byId = Object.fromEntries(stats.perRegion.map((r) => [r.id, r]));
  const [hoveredId, setHoveredId] = useState(null);

  const openRegion = (id) => {
    try { sessionStorage.setItem('br_region', id); } catch { /* noop */ }
    go('/app');
  };

  const metroList = regions && regions.length ? regions : REGIONS_FALLBACK;

  return (
    <section className="section" id="regions">
      <div className="wrap">
        <Reveal>
          <div className="section-head">
            <div className="eyebrow">{t.rgEyebrow}</div>
            <h2>{t.rgTitle}</h2>
            <p>{t.rgSub}</p>
          </div>
        </Reveal>
        <div className="showcase">
          <Reveal>
            <CoverageLeafletMap
              regions={metroList}
              byId={byId}
              hoveredId={hoveredId}
              onSelectRegion={openRegion}
            />
          </Reveal>
          <div className="metro-list">
            {metroList.map((r, i) => {
              const liveRow = byId[r.id];
              const isHovered = hoveredId === r.id;
              return (
                <Reveal key={r.id} delay={Math.min(i * 50, 300)}>
                  <button
                    className={`metro-row ${isHovered ? 'active' : ''}`}
                    onClick={() => openRegion(r.id)}
                    onMouseEnter={() => setHoveredId(r.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <span className="m-idx">{String(i + 1).padStart(2, '0')}</span>
                    <span className="m-name">{r.name}</span>
                    <span className="m-coord">{r.center[0].toFixed(2)}°N {r.center[1].toFixed(2)}°E</span>
                    <span className="m-cells grad-text">{liveRow ? `${liveRow.total} ${t.cells}` : `— ${t.cells}`}</span>
                    <IconArrowRight size={15} style={{ color: isHovered ? '#38bdf8' : 'var(--br-muted)' }} />
                  </button>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Verification: baked headline numbers ---------- */
const CASES = [
  { key: 'c1', now: 0.57, per: 0.06, gain: '+0.51', up: true },
  { key: 'c2', now: 0.26, per: 0.0, gain: '+0.26', up: true },
  { key: 'c3', now: 0.63, per: 0.63, gain: null, up: false },
];

export function Verification({ t }) {
  return (
    <section className="section" id="proof">
      <div className="wrap">
        <Reveal>
          <div className="section-head">
            <div className="eyebrow">{t.pfEyebrow}</div>
            <h2>{t.pfTitle}</h2>
            <p>{t.pfSub}</p>
          </div>
        </Reveal>
        <div className="verif-grid">
          {CASES.map((c, i) => (
            <Reveal key={c.key} delay={i * 100}>
              <div className="verif-card">
                <div className="v-case">{t[`${c.key}D`]}</div>
                <h3>{t[`${c.key}T`]}</h3>
                <div className="vs-row">
                  <div className="vs-label"><span>{t.nowcast}</span><b>{c.now.toFixed(2)}</b></div>
                  <div className="vs-bar"><i style={{ width: `${Math.round(c.now * 100)}%` }} /></div>
                </div>
                <div className="vs-row">
                  <div className="vs-label"><span>{t.persistence}</span><b>{c.per.toFixed(2)}</b></div>
                  <div className="vs-bar dim"><i style={{ width: `${Math.round(c.per * 100)}%` }} /></div>
                </div>
                <span className={`vs-gain ${c.up ? 'up' : 'flat'}`}>
                  {c.up ? `${t.gain} ${c.gain}` : t.tie}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <p className="verif-note">{t.verifNote}</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- India-first data story ---------- */
const SOURCES = [
  { key: 's1', status: 'request' },
  { key: 's2', status: 'register' },
  { key: 's3', status: 'request' },
  { key: 's4', status: 'register' },
  { key: 's5', status: 'register' },
  { key: 's6', status: 'verified' },
  { key: 's7', status: 'verified' },
];

export function DataStory({ t }) {
  return (
    <section className="section" id="data">
      <div className="wrap">
        <Reveal>
          <div className="section-head">
            <div className="eyebrow">{t.dtEyebrow}</div>
            <h2>{t.dtTitle}</h2>
            <p>{t.dtSub}</p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="source-table">
            <div className="source-row head">
              <span>{t.srcCol}</span><span className="s-desc">{t.descCol}</span><span>{t.statusCol}</span>
            </div>
            {SOURCES.map((s) => (
              <div className="source-row" key={s.key}>
                <span className="s-name">{t[`${s.key}n`]}</span>
                <span className="s-desc">{t[`${s.key}d`]}</span>
                <span className={`status-pill ${s.status}`}>
                  {s.status === 'verified' ? <IconCheck size={12} style={{ verticalAlign: -1, marginRight: 4 }} /> : null}
                  {s.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Closing CTA ---------- */
export function Closing({ t }) {
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <Reveal>
          <div className="cta">
            <h2>{t.ctaTitleA}<br /><span className="grad-text">{t.ctaTitleB}</span></h2>
            <p>{t.ctaSub}</p>
            <div className="hero-ctas">
              <button className="btn btn-primary" onClick={() => go('/app')}>
                {t.launchDemo} <IconArrowRight size={17} />
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
