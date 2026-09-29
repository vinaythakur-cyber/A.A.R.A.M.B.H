import { useCallback, useEffect, useRef, useState } from 'react';
import Header from '../components/Header.jsx';
import StormMap from '../components/StormMap.jsx';
import DistrictPanel from '../components/DistrictPanel.jsx';
import TimeSlider from '../components/TimeSlider.jsx';
import AlertModal from '../components/AlertModal.jsx';
import { loadArmed } from '../utils/alerts.js';
import Footer from '../components/Footer.jsx';
import {
  API_URL,
  apiFetch,
  withRegion,
  wsUrl,
  addMinutesISO,
  REGIONS_FALLBACK,
  DEFAULT_REGION,
} from '../utils/api.js';
import { STRINGS } from '../utils/i18n.js';

const POLL_MS = 60000;

export default function Dashboard({ lang, onLang, theme = 'dark', onToggleTheme }) {
  const t = STRINGS[lang] || STRINGS.en;

  const [regions, setRegions] = useState(REGIONS_FALLBACK);
  const [regionId, setRegionId] = useState(() => {
    try {
      const saved = sessionStorage.getItem('br_region');
      if (saved) {
        sessionStorage.removeItem('br_region');
        return saved;
      }
    } catch { /* noop */ }
    return DEFAULT_REGION;
  });
  const region = regions.find((r) => r.id === regionId) || regions[0];

  const [online, setOnline] = useState(false);
  const [health, setHealth] = useState(null);
  const [cycle, setCycle] = useState(null);
  const [hazards, setHazards] = useState(null);
  const [radar, setRadar] = useState(null);
  const [districts, setDistricts] = useState([]);
  const [districtsAt, setDistrictsAt] = useState(Date.now());
  const [initialLoading, setInitialLoading] = useState(true);

  const [leadMin, setLeadMin] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [toggles, setToggles] = useState({
    lightning: true,
    hail: true,
    downburst: true,
    cloudburst: true,
    radar: true,
    imd: false,
    bhuvan: false,
  });
  const [radarOpacity, setRadarOpacity] = useState(0.65);
  const [alertDistrict, setAlertDistrict] = useState(null);
  const [armedMap, setArmedMap] = useState(() => loadArmed());
  const [mobileView, setMobileView] = useState('map');
  const [showDistricts, setShowDistricts] = useState(true);

  // Fresh values for WS / poll callbacks without stale closures.
  const stateRef = useRef({ regionId, leadMin });
  stateRef.current = { regionId, leadMin };

  const fetchHazards = useCallback(async (region, lead) => {
    const path =
      lead === 0
        ? withRegion('/api/hazards/latest', region)
        : withRegion(`/api/forecast/${lead}`, region);
    const data = await apiFetch(path);
    setHazards(data);
  }, []);

  const loadAll = useCallback(
    async (region, lead) => {
      // Health + cycle first: they decide the online/offline banner.
      try {
        const [h, c] = await Promise.all([
          apiFetch('/api/health'),
          apiFetch(withRegion('/api/cycle', region)),
        ]);
        setHealth(h);
        setCycle(c);
        setOnline(true);
      } catch {
        setOnline(false);
        setInitialLoading(false);
        return;
      }
      const [hz, rd, ds] = await Promise.allSettled([
        (async () => {
          const path =
            lead === 0
              ? withRegion('/api/hazards/latest', region)
              : withRegion(`/api/forecast/${lead}`, region);
          return apiFetch(path);
        })(),
        apiFetch(withRegion('/api/radar/latest', region)),
        apiFetch(withRegion('/api/districts', region)),
      ]);
      if (hz.status === 'fulfilled') setHazards(hz.value);
      if (rd.status === 'fulfilled') setRadar(rd.value);
      if (ds.status === 'fulfilled' && Array.isArray(ds.value)) {
        setDistricts(ds.value);
        setDistrictsAt(Date.now());
      }
      setInitialLoading(false);
    },
    [],
  );

  // Regions catalog (authoritative from backend; fallback presets otherwise).
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/regions')
      .then((list) => {
        if (cancelled) return;
        if (Array.isArray(list) && list.length > 0) {
          setRegions(list);
          // A region saved from the landing page may not be the default.
          const { regionId: r } = stateRef.current;
          if (!list.find((x) => x.id === r)) setRegionId(DEFAULT_REGION);
        }
      })
      .catch(() => {
        /* keep REGIONS_FALLBACK */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial load + 60 s poll fallback.
  useEffect(() => {
    const { regionId: r, leadMin: l } = stateRef.current;
    loadAll(r, l);
    const id = setInterval(() => {
      const s = stateRef.current;
      loadAll(s.regionId, s.leadMin);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [loadAll]);

  // Live WebSocket: refresh on every new inference cycle, reconnect on drop
  // with exponential backoff.
  useEffect(() => {
    let ws = null;
    let retryMs = 3000;
    let closed = false;
    const connect = () => {
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        schedule();
        return;
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && (msg.event === 'new_cycle' || msg.type === 'new_cycle')) {
            const s = stateRef.current;
            loadAll(s.regionId, s.leadMin);
          }
        } catch {
          /* ignore malformed push */
        }
      };
      ws.onopen = () => {
        retryMs = 3000;
      };
      ws.onclose = () => {
        if (!closed) schedule();
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      };
    };
    const schedule = () => {
      if (closed) return;
      setTimeout(() => {
        if (!closed) connect();
      }, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
    };
    connect();
    return () => {
      closed = true;
      try {
        ws && ws.close();
      } catch {
        /* noop */
      }
    };
  }, [loadAll]);

  // Debounced forecast fetch when the time slider (or region) changes.
  useEffect(() => {
    const id = setTimeout(() => {
      fetchHazards(regionId, leadMin).catch(() => {
        /* keep previous polygons */
      });
    }, 250);
    return () => clearTimeout(id);
  }, [leadMin, regionId, fetchHazards]);

  // Play mode: auto-advance the forecast lead.
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setLeadMin((l) => (l >= 360 ? 0 : l + 15));
    }, 1500);
    return () => clearInterval(id);
  }, [playing]);

  const handleRegion = (id) => {
    if (id === regionId) return;
    setRegionId(id);
    setLeadMin(0);
    setPlaying(false);
    loadAll(id, 0);
  };

  const handleToggle = (key) => {
    setToggles((prev) => {
      if (key === 'bhuvan-on') return { ...prev, bhuvan: true };
      if (key === 'bhuvan-off') return { ...prev, bhuvan: false };
      return { ...prev, [key]: !prev[key] };
    });
  };

  const handleAlertSaved = () => {
    setArmedMap(loadArmed());
  };

  const armedForRegion = {};
  districts.forEach((d) => {
    if (armedMap[`${regionId}::${d.district}`]) armedForRegion[d.district] = true;
  });

  const validTimeISO = addMinutesISO(cycle?.valid_time, leadMin);
  const geoKey = `${regionId}-${leadMin}-${cycle?.cycle_id ?? 'na'}-${
    hazards?.features?.length ?? 0
  }`;

  return (
    <div className="app">
      <Header
        online={online}
        health={health}
        cycle={cycle}
        counts={cycle?.hazard_counts}
        regions={regions}
        regionId={regionId}
        onRegion={handleRegion}
        lang={lang}
        onLang={onLang}
        t={t}
        theme={theme}
        onToggleTheme={onToggleTheme}
        showDistricts={showDistricts}
        onToggleDistricts={() => setShowDistricts((v) => !v)}
        onRefresh={() => {
          const s = stateRef.current;
          loadAll(s.regionId, s.leadMin);
        }}
      />

      {!online && !initialLoading && (
        <div className="offline-banner">
          <span>{t.backendOffline}</span>
          <button
            className="ghost-btn"
            onClick={() => {
              const s = stateRef.current;
              loadAll(s.regionId, s.leadMin);
            }}
          >
            {t.retry}
          </button>
        </div>
      )}

      {/* Mobile Mode Switcher: Radar/Map vs District Countdown Alerts */}
      <div className="dash-mobile-nav">
        <button
          className={`dash-mobile-nav-btn ${mobileView === 'map' ? 'active' : ''}`}
          onClick={() => setMobileView('map')}
        >
          <span>🗺️</span> {t.radar || 'Radar & Nowcast'}
        </button>
        <button
          className={`dash-mobile-nav-btn ${mobileView === 'districts' ? 'active' : ''}`}
          onClick={() => setMobileView('districts')}
        >
          <span>⚡</span> {t.districtAlerts} ({districts.length})
        </button>
      </div>

      <div className={`main ${mobileView === 'map' ? 'mobile-show-map' : 'mobile-show-districts'}`}>
        <div className="map-area">
          <StormMap
            region={region}
            hazards={hazards}
            geoKey={geoKey}
            radar={radar}
            radarOpacity={radarOpacity}
            toggles={toggles}
            onToggle={handleToggle}
            onOpacity={setRadarOpacity}
            lang={lang}
            t={t}
          />
          <TimeSlider
            leadMin={leadMin}
            onChange={(v) => {
              setPlaying(false);
              setLeadMin(v);
            }}
            validTimeISO={validTimeISO}
            playing={playing}
            onPlayToggle={() => setPlaying((p) => !p)}
            t={t}
          />
        </div>
        <DistrictPanel
          districts={districts}
          fetchedAt={districtsAt}
          lang={lang}
          t={t}
          armedMap={armedForRegion}
          onArm={setAlertDistrict}
          loading={initialLoading && online}
          hidden={!showDistricts}
        />
      </div>

      <Footer t={t} online={online} apiUrl={API_URL} />

      {alertDistrict && (
        <AlertModal
          district={alertDistrict}
          regionId={regionId}
          lang={lang}
          t={t}
          onClose={() => setAlertDistrict(null)}
          onSaved={handleAlertSaved}
        />
      )}
    </div>
  );
}
