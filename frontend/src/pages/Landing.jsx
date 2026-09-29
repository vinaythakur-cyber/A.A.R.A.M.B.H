import { Hero, Ticker, LiveStrip } from '../components/landing/Hero.jsx';
import { HazardCards, HowItWorks, Regions, Verification, DataStory, Closing } from '../components/landing/Sections.jsx';
import { SiteNav, SiteFooter } from '../components/landing/SiteNav.jsx';
import { useNowcastLive } from '../hooks/useLive.js';
import RainScene3D from '../components/3d/RainScene3D.jsx';

/** Marketing landing page — Apple-style, driven by live API data. */
export default function Landing({ t, lang, onLang, theme = 'dark', onToggleTheme }) {
  const live = useNowcastLive();
  return (
    <div className="site">
      <RainScene3D theme={theme} />
      <SiteNav
        t={t}
        lang={lang}
        onLang={onLang}
        online={live.online}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <main>
        <Hero t={t} live={live} />
        <Ticker t={t} live={live} />
        <LiveStrip t={t} lang={lang} live={live} />
        <HazardCards t={t} />
        <HowItWorks t={t} />
        <Regions t={t} live={live} />
        <Verification t={t} />
        <DataStory t={t} />
        <Closing t={t} />
      </main>
      <SiteFooter t={t} />
    </div>
  );
}
