import { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  WMSTileLayer,
  GeoJSON,
  ImageOverlay,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import {
  INDIA_VIEW,
  INDIA_MAX_BOUNDS,
  REGION_ZOOM,
  SEVERITY_COLORS,
  HAZARD_META,
  hazardLabel,
  formatIST,
  renderRadarDataUrl,
  escHtml,
} from '../utils/api.js';
import { severityLabel } from '../utils/i18n.js';
import { HAZARD_ICON, IconRadar, IconGlobe, IconAlert, IconLayers } from './icons.jsx';

// Re-centre the map whenever the selected metro window changes.
function Recenter({ region }) {
  const map = useMap();
  useEffect(() => {
    if (region?.center) {
      map.setView(region.center, REGION_ZOOM, { animate: true });
    }
  }, [map, region]);
  return null;
}

// Keep Leaflet's internal size in sync with its container. Leaflet only
// measures its container once on init -- if the container later changes
// width/height via CSS (e.g. the District Alerts panel sliding open or
// closed, a window resize, or a layout change), Leaflet doesn't notice on
// its own and the map renders stale (black bars / missing tiles) until a
// manual nudge. A ResizeObserver on the container catches every such
// change and calls invalidateSize(), which Leaflet debounces internally.
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

// Bhuvan WMS state codes per metro window, following the documented
// lulc:<STATE>_LULC50K_1112 naming convention. Layer ids may need a tweak
// against the live Bhuvan catalog; the toggle degrades gracefully (OSM stays
// underneath).
const BHUVAN_STATE = {
  'delhi-ncr': 'DL',
  mumbai: 'MH',
  chennai: 'TN',
  kolkata: 'WB',
  bengaluru: 'KA',
  hyderabad: 'TG',
  ahmedabad: 'GJ',
  lucknow: 'UP',
};

function circlePoly(center, radiusDeg, n = 30) {
  const [lat, lon] = center;
  const ring = [];
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n;
    ring.push([lon + radiusDeg * Math.cos(a), lat + radiusDeg * Math.sin(a)]);
  }
  return [ring];
}

// Simulated IMD-style reference polygons, clearly labeled. They are coarse,
// illustrative mock warnings — not official bulletins.
function useImdSimPolygons(region, t) {
  return useMemo(() => {
    if (!region?.center) return null;
    const [lat, lon] = region.center;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: circlePoly([lat + 0.18, lon - 0.22], 0.24),
          },
          properties: { severity: 'orange', note: t.imdSimAdvisory },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: circlePoly([lat - 0.28, lon + 0.3], 0.17),
          },
          properties: { severity: 'red', note: t.imdSimAdvisory },
        },
      ],
    };
  }, [region, t]);
}

function hazardStyle(feature) {
  const sev = feature?.properties?.severity || 'yellow';
  const c = SEVERITY_COLORS[sev] || SEVERITY_COLORS.yellow;
  return {
    color: c,
    weight: 2,
    opacity: 0.95,
    fillColor: c,
    fillOpacity: 0.32,
  };
}

function imdStyle(feature) {
  const sev = feature?.properties?.severity || 'orange';
  const c = SEVERITY_COLORS[sev] || SEVERITY_COLORS.orange;
  return {
    color: '#c4b5fd',
    weight: 2,
    dashArray: '8 6',
    opacity: 0.9,
    fillColor: c,
    fillOpacity: 0.14,
  };
}

function bindHazardPopup(feature, layer, lang, t) {
  const p = feature.properties || {};
  const meta = HAZARD_META[p.hazard] || { label: p.hazard, icon: '⛈️' };
  const sevColor = SEVERITY_COLORS[p.severity] || '#facc15';
  const advisory =
    (lang === 'hi' && p.advisory_hi ? p.advisory_hi : p.advisory) ||
    t.noAdvisory;
  const html = `
    <div class="popup">
      <div class="popup-title">${meta.icon} ${escHtml(
        hazardLabel(p.hazard, lang),
      )}
        <span class="popup-sev" style="background:${sevColor}22;color:${sevColor};border:1px solid ${sevColor}">${escHtml(
          severityLabel(p.severity, lang),
        )}</span>
      </div>
      ${p.intensity ? `<div><b>${escHtml(t.intensity)}:</b> ${escHtml(p.intensity)}</div>` : ''}
      ${
        p.probability != null
          ? `<div><b>${escHtml(t.probability)}:</b> ${Math.round(
              p.probability * 100,
            )}%</div>`
          : ''
      }
      ${
        p.eta_minutes != null
          ? `<div><b>${escHtml(t.eta)}:</b> ${escHtml(p.eta_minutes)} ${escHtml(t.minutes)}</div>`
          : ''
      }
      ${p.valid_time ? `<div><b>${escHtml(t.validTime)}:</b> ${escHtml(formatIST(p.valid_time))}</div>` : ''}
      <div class="popup-advisory">${escHtml(advisory)}</div>
    </div>`;
  layer.bindPopup(html, { maxWidth: 300 });
}

function Legend({ toggles, t }) {
  return (
    <div className="map-legend">
      <div className="legend-title">{t.legend}</div>
      <div className="legend-row">
        {['yellow', 'orange', 'red'].map((s) => (
          <span key={s} className="legend-item">
            <i
              className="legend-swatch"
              style={{ background: SEVERITY_COLORS[s], color: SEVERITY_COLORS[s] }}
            />
            {s}
          </span>
        ))}
      </div>
      {toggles.radar && (
        <div className="legend-row">
          <span className="legend-item">{t.radarScale}</span>
          <span className="radar-gradient" />
        </div>
      )}
      {toggles.imd && (
        <div className="legend-note">▨ {t.imdSimBadge}</div>
      )}
    </div>
  );
}

export default function StormMap({
  region,
  hazards,
  geoKey,
  radar,
  radarOpacity,
  toggles,
  onToggle,
  onOpacity,
  lang,
  t,
}) {
  const mapCenter = region?.center || INDIA_VIEW.center;
  const mapZoom = region?.center ? REGION_ZOOM : INDIA_VIEW.zoom;

  const filtered = useMemo(() => {
    if (!hazards?.features) return null;
    const feats = hazards.features.filter(
      (f) => toggles[f?.properties?.hazard] !== false,
    );
    return { type: 'FeatureCollection', features: feats };
  }, [hazards, toggles]);

  const radarUrl = useMemo(() => renderRadarDataUrl(radar), [radar]);
  const imdSim = useImdSimPolygons(region, t);
  const bhuvanLayers = `lulc:${BHUVAN_STATE[region?.id] || 'DL'}_LULC50K_1112`;

  return (
    <div className="map-wrap">
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        minZoom={4}
        maxBounds={INDIA_MAX_BOUNDS}
        maxBoundsViscosity={0.9}
        className="storm-map"
        zoomControl={false}
        attributionControl={true}
      >
        <Recenter region={region} />
        <AutoResize />
        <ZoomControl position="bottomright" />
        {toggles.bhuvan ? (
          <>
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              opacity={0.55}
            />
            <WMSTileLayer
              url="https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms"
              layers={bhuvanLayers}
              format="image/png"
              transparent={false}
              version="1.1.1"
              opacity={0.95}
              attribution="ISRO Bhuvan (NRSC)"
            />
          </>
        ) : (
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
        )}

        {toggles.radar && radarUrl && radar?.bounds && (
          <ImageOverlay
            url={radarUrl}
            bounds={radar.bounds}
            opacity={radarOpacity}
            zIndex={10}
          />
        )}

        {filtered && filtered.features.length > 0 && (
          <GeoJSON
            key={geoKey}
            data={filtered}
            style={hazardStyle}
            onEachFeature={(f, l) => bindHazardPopup(f, l, lang, t)}
          />
        )}

        {toggles.imd && imdSim && (
          <GeoJSON
            key={`imd-${region?.id}`}
            data={imdSim}
            style={imdStyle}
            onEachFeature={(f, l) => {
              l.bindTooltip(
                `<b>${escHtml(t.imdSimBadge)}</b><br/>${escHtml(
                  f.properties.note,
                )}`,
                { sticky: true },
              );
            }}
          />
        )}
      </MapContainer>

      <div className="layer-panel">
        <div className="layer-panel-title">
          <IconLayers size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
          {t.layers}
        </div>
        {Object.keys(HAZARD_META).map((h) => {
          const Icon = HAZARD_ICON[h];
          return (
            <label key={h} className="layer-toggle">
              <input
                type="checkbox"
                checked={toggles[h] !== false}
                onChange={() => onToggle(h)}
              />
              <span className="lt-ic">{Icon ? <Icon size={15} /> : HAZARD_META[h].icon}</span>
              <span>{hazardLabel(h, lang)}</span>
            </label>
          );
        })}
        <label className="layer-toggle">
          <input
            type="checkbox"
            checked={!!toggles.radar}
            onChange={() => onToggle('radar')}
          />
          <span className="lt-ic"><IconRadar size={15} /></span>
          <span>{t.radar}</span>
        </label>
        {toggles.radar && (
          <label className="opacity-row">
            {t.opacity}
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(radarOpacity * 100)}
              onChange={(e) => onOpacity(Number(e.target.value) / 100)}
            />
          </label>
        )}
        <label className="layer-toggle">
          <input
            type="checkbox"
            checked={!!toggles.imd}
            onChange={() => onToggle('imd')}
          />
          <span className="lt-ic"><IconGlobe size={15} /></span>
          <span>{t.compare}</span>
        </label>
        <div className="base-toggle">
          <span>{t.baseMap}</span>
          <div className="seg">
            <button
              className={!toggles.bhuvan ? 'active' : ''}
              onClick={() => onToggle('bhuvan-off')}
            >
              {t.osm}
            </button>
            <button
              className={toggles.bhuvan ? 'active' : ''}
              onClick={() => onToggle('bhuvan-on')}
            >
              {t.bhuvan}
            </button>
          </div>
        </div>
        {toggles.imd && (
          <div className="imd-note">
            <IconAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{t.imdSimNote}</span>
          </div>
        )}
      </div>

      <Legend toggles={toggles} t={t} />
    </div>
  );
}
