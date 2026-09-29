import React, { useState } from 'react';
import {
  MapContainer,
  TileLayer,
  WMSTileLayer,
  CircleMarker,
  Circle,
  Tooltip as LeafletTooltip,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { REGIONS_FALLBACK } from '../../utils/api.js';
import { go } from '../../router.js';

/**
 * Interactive Leaflet Map for the Landing Page Hero section.
 * Replaces the canvas storm cloud with high-resolution GEBCO elevation & ocean bathymetry relief
 * centered over the Indian subcontinent with interactive radar beacons for the 8 metro regions.
 */
export default function HeroLeafletMap({ regions = REGIONS_FALLBACK, worstSev = 'yellow' }) {
  const [basemap, setBasemap] = useState('gebco'); // 'gebco' | 'osm_dark'

  const metroList = regions && regions.length > 0 ? regions : REGIONS_FALLBACK;

  const handleMetroClick = (regionId) => {
    try {
      sessionStorage.setItem('br_region', regionId);
    } catch {
      // storage unavailable
    }
    go('/app');
  };

  return (
    <div className="hero-leaflet-wrap">
      <MapContainer
        center={[22.5, 82.5]}
        zoom={4.4}
        minZoom={3}
        maxZoom={10}
        scrollWheelZoom={false}
        attributionControl={false}
        className="hero-leaflet-container"
      >
        {/* Basemap Selection */}
        {basemap === 'gebco' ? (
          <>
            {/* GEBCO Global Ocean Bathymetry & Land Topographic Relief (WMS) */}
            <WMSTileLayer
              url="https://wms.gebco.net/mapserv?"
              layers="GEBCO_LATEST"
              format="image/png"
              transparent={false}
              attribution="&copy; GEBCO / NOAA / IHO / IOC"
            />
            {/* Reference Overlay: Country boundaries, coastlines, and place labels */}
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
              zIndex={5}
              opacity={0.88}
            />
          </>
        ) : (
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            className="reloc-osm-dark-tiles"
            maxZoom={19}
          />
        )}

        {/* 8 Indian Metro Convective Nowcast Beacons */}
        {metroList.map((m) => (
          <React.Fragment key={m.id}>
            {/* Outer animated radar pulse ring */}
            <Circle
              center={m.center}
              radius={68000}
              pathOptions={{
                color: '#38bdf8',
                fillColor: '#38bdf8',
                fillOpacity: 0.16,
                weight: 1.4,
                dashArray: '4, 4',
              }}
              eventHandlers={{
                click: () => handleMetroClick(m.id),
              }}
            />

            {/* Inner radar ping */}
            <Circle
              center={m.center}
              radius={32000}
              pathOptions={{
                color: '#60a5fa',
                fillColor: '#38bdf8',
                fillOpacity: 0.28,
                weight: 1.2,
              }}
              eventHandlers={{
                click: () => handleMetroClick(m.id),
              }}
            />

            {/* Center Beacon Marker */}
            <CircleMarker
              center={m.center}
              radius={7.5}
              pathOptions={{
                color: '#ffffff',
                fillColor: '#0284c7',
                fillOpacity: 0.95,
                weight: 2.5,
              }}
              eventHandlers={{
                click: () => handleMetroClick(m.id),
              }}
            >
              <LeafletTooltip direction="top" offset={[0, -10]} opacity={1} permanent={false}>
                <div style={{ padding: '3px 6px', textAlign: 'center', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 800, fontSize: 12, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#38bdf8', marginTop: 2, fontWeight: 600 }}>
                    Live Convective Nowcast →
                  </div>
                </div>
              </LeafletTooltip>
            </CircleMarker>
          </React.Fragment>
        ))}
      </MapContainer>

      {/* Floating Basemap Style Switcher */}
      <div className="hero-map-basemap-toggle">
        <button
          className={`hero-map-btn ${basemap === 'gebco' ? 'active' : ''}`}
          onClick={() => setBasemap('gebco')}
          title="GEBCO Ocean Bathymetry & Topographic Relief"
        >
          🏔️ GEBCO Relief
        </button>
        <button
          className={`hero-map-btn ${basemap === 'osm_dark' ? 'active' : ''}`}
          onClick={() => setBasemap('osm_dark')}
          title="OpenStreetMap Dark GIS"
        >
          🌃 Dark OSS
        </button>
      </div>
    </div>
  );
}
