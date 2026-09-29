import { useState } from 'react';
import { Logo, IconArrowRight, IconMenu, IconX } from '../icons.jsx';
import { go } from '../../router.js';
import { useISTClock } from '../../hooks/useLive.js';

/** Glassy sticky nav: logo, section links, live IST clock, lang toggle, CTA. */
export function SiteNav({ t, lang, onLang, online, theme = 'dark', onToggleTheme }) {
  const clock = useISTClock();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (hash) => {
    setMobileMenuOpen(false);
    if (hash) {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="site-nav">
      <div className="nav-inner">
        <a className="nav-brand" onClick={() => go('/')} role="link" tabIndex={0}
           onKeyDown={(e) => e.key === 'Enter' && go('/')}>
          <Logo />
          <span>A.A.R.A.<span className="grad-text">M.B.H</span></span>
        </a>
        <div className="nav-links">
          <a href="#live">{t.navLive}</a>
          <a href="#hazards">{t.navHazards}</a>
          <a href="#how">{t.navHow}</a>
          <a href="#regions">{t.navRegions}</a>
          <a href="#proof">{t.navProof}</a>
          <a href="#data">{t.navData}</a>
        </div>
        <div className="nav-right desktop-only-flex">
          <span className="nav-clock">
            <span className={`live-badge ${online ? '' : 'off'}`}>
              <span className="dot" />
              {online ? t.liveNow : t.offline}
            </span>
            <span className="clock-text">{clock}</span>
          </span>
          <div className="nav-lang" role="group" aria-label="language">
            <button className={lang === 'en' ? 'active' : ''} onClick={() => onLang('en')}>EN</button>
            <button className={lang === 'hi' ? 'active' : ''} onClick={() => onLang('hi')}>हिंदी</button>
          </div>
          {onToggleTheme && (
            <button
              className="theme-toggle-btn"
              onClick={onToggleTheme}
              title={theme === 'light' ? 'Switch to Dark mode' : 'Switch to Light mode'}
              aria-label="Toggle light or dark theme"
            >
              {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => go('/relocation')} style={{ borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}>
            Relocation Engine
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => go('/app')}>
            {t.launchDemo} <IconArrowRight size={15} />
          </button>
        </div>

        {/* Mobile Nav Actions */}
        <div className="nav-mobile-actions">
          <button className="btn btn-primary btn-xs" onClick={() => go('/app')}>
            Live Demo
          </button>
          <button
            className="mobile-hamburger-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <IconX size={20} /> : <IconMenu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-down Drawer */}
      {mobileMenuOpen && (
        <div className="nav-mobile-drawer">
          <div className="mobile-drawer-links">
            <a href="#live" onClick={() => handleNavClick('#live')}>{t.navLive}</a>
            <a href="#hazards" onClick={() => handleNavClick('#hazards')}>{t.navHazards}</a>
            <a href="#how" onClick={() => handleNavClick('#how')}>{t.navHow}</a>
            <a href="#regions" onClick={() => handleNavClick('#regions')}>{t.navRegions}</a>
            <a href="#proof" onClick={() => handleNavClick('#proof')}>{t.navProof}</a>
            <a href="#data" onClick={() => handleNavClick('#data')}>{t.navData}</a>
          </div>

          <div className="mobile-drawer-controls">
            <div className="mobile-drawer-row">
              <span className={`live-badge ${online ? '' : 'off'}`}>
                <span className="dot" />
                {online ? t.liveNow : t.offline}
              </span>
              <span style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' }}>{clock}</span>
            </div>

            <div className="nav-lang" role="group" aria-label="language">
              <button className={lang === 'en' ? 'active' : ''} onClick={() => onLang('en')}>EN</button>
              <button className={lang === 'hi' ? 'active' : ''} onClick={() => onLang('hi')}>हिंदी</button>
            </div>

            {onToggleTheme && (
              <button
                className="theme-toggle-btn"
                onClick={onToggleTheme}
                style={{ padding: '6px 12px' }}
                title={theme === 'light' ? 'Switch to Dark mode' : 'Switch to Light mode'}
              >
                {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
              </button>
            )}
          </div>

          <div className="mobile-drawer-buttons">
            <button className="btn btn-primary" onClick={() => { setMobileMenuOpen(false); go('/app'); }} style={{ width: '100%', justifyContent: 'center' }}>
              {t.launchDemo} <IconArrowRight size={15} />
            </button>
            <button className="btn btn-ghost" onClick={() => { setMobileMenuOpen(false); go('/relocation'); }} style={{ width: '100%', justifyContent: 'center', borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}>
              Relocation &amp; Carrying Capacity
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

/** Site footer: brand, product/docs links, provenance note. */
export function SiteFooter({ t }) {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <a className="nav-brand" onClick={() => go('/')} role="link" tabIndex={0}
               onKeyDown={(e) => e.key === 'Enter' && go('/')}>
              <Logo />
              <span>A.A.R.A.<span className="grad-text">M.B.H</span></span>
            </a>
            <div style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600, marginTop: 4, letterSpacing: '0.01em' }}>
              Atmospheric Analysis &amp; Rapid Alert Monitoring for Bursts &amp; Hazards
            </div>
            <p>{t.footTag}</p>
          </div>
          <div className="foot-col">
            <h4>{t.footProduct}</h4>
            <button className="link" onClick={() => go('/app')}>{t.launchDemo}</button>
            <a href="#live">{t.navLive}</a>
            <a href="#proof">{t.navProof}</a>
            <a href="#data">{t.navData}</a>
          </div>
          <div className="foot-col">
            <h4>{t.footExplore}</h4>
            <a href="#hazards">{t.navHazards}</a>
            <a href="#how">{t.navHow}</a>
            <a href="#regions">{t.navRegions}</a>
          </div>
        </div>
        <div className="foot-base">
          <span>{t.footRights}</span>
          <span>{t.footSih}</span>
        </div>
        <div className="foot-note">{t.footDemo}</div>
      </div>
    </footer>
  );
}
