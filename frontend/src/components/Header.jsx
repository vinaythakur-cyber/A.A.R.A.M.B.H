import { SEVERITY_COLORS } from '../utils/api.js';
import { regionName } from '../utils/i18n.js';
import { Logo, IconArrowLeft, IconMenu } from './icons.jsx';
import { useISTClock } from '../hooks/useLive.js';
import { go } from '../router.js';
import LedTimer from './LedTimer.jsx';

export default function Header({
  online,
  health,
  cycle,
  counts,
  regions,
  regionId,
  onRegion,
  lang,
  onLang,
  t,
  theme = 'dark',
  onToggleTheme,
  showDistricts,
  onToggleDistricts,
  onRefresh,
}) {
  const clock = useISTClock();
  const totalCells = counts
    ? Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0)
    : 0;
  return (
    <header className="app-header">
      <div className="brand">
        <button className="brand-back" onClick={() => go('/')} title="A.A.R.A.M.B.H home">
          <IconArrowLeft size={14} />
        </button>
        <Logo size={24} />
        <div>
          <div className="brand-title">A.A.R.A.M.B.H</div>
          <div className="brand-sub" title={t.subtitle}>Storm Operations · 0–6h Nowcast</div>
        </div>
      </div>

      <nav className="region-bar" aria-label={t.region}>
        {regions.map((r) => (
          <button
            key={r.id}
            className={`region-chip ${r.id === regionId ? 'active' : ''}`}
            onClick={() => onRegion(r.id)}
            title={r.name}
          >
            {regionName(r, lang)}
          </button>
        ))}
      </nav>

      <div className="header-right">
        <LedTimer
          nextInSeconds={cycle?.next_cycle_in_s}
          onRefresh={onRefresh}
          size="sm"
          label="NEXT UPDATE"
        />

        <div className="lang-toggle" role="group" aria-label="language">
          <button
            className={lang === 'en' ? 'active' : ''}
            onClick={() => onLang('en')}
          >
            EN
          </button>
          <button
            className={lang === 'hi' ? 'active' : ''}
            onClick={() => onLang('hi')}
          >
            हिंदी
          </button>
        </div>

        {onToggleTheme && (
          <button
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            title={theme === 'light' ? 'Switch to Dark mode' : 'Switch to Light mode'}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        )}

        {onToggleDistricts && (
          <button
            className="district-panel-toggle-btn"
            onClick={onToggleDistricts}
            title={showDistricts ? 'Hide district alerts panel' : 'Show district alerts panel'}
            aria-label="Toggle district alerts panel"
            aria-pressed={showDistricts}
          >
            <IconMenu size={16} />
          </button>
        )}

        <button
          onClick={() => go('/relocation')}
          title="Switch to AI-GIS Relocation & Carrying Capacity Engine"
          style={{
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            color: '#38bdf8',
            padding: '5px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
          }}
        >
          Relocation Planning →
        </button>

        <div className="status-block">
          <span className={`status-dot ${online ? 'on' : 'off'}`} />
          <span className="status-text">
            {online ? t.live : t.offline}
          </span>
          {health?.mode && (
            <span className={`mode-badge mode-${health.mode}`}>
              {health.mode === 'demo' ? t.demo : t.live}
            </span>
          )}
        </div>

        <div className="cycle-block" title={t.lastCycle}>
          <span className="cycle-label">{t.lastCycle}</span>
          <span className="cycle-time">
            {cycle?.valid_time
              ? new Intl.DateTimeFormat('en-IN', {
                  day: '2-digit', month: 'short', hour: '2-digit',
                  minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
                }).format(new Date(cycle.valid_time)) + ' IST'
              : '—'}
          </span>
        </div>

        <div className="count-badges" title={t.cells}>
          {counts &&
            Object.entries(counts).map(([sev, n]) => (
              <span
                key={sev}
                className="count-badge"
                style={{
                  background: `${SEVERITY_COLORS[sev] || '#888'}1f`,
                  borderColor: SEVERITY_COLORS[sev] || '#888',
                  color: SEVERITY_COLORS[sev] || '#888',
                }}
              >
                {n} {sev}
              </span>
            ))}
          {!counts && totalCells === 0 && (
            <span className="count-badge idle">— {t.cells}</span>
          )}
        </div>
      </div>
    </header>
  );
}
