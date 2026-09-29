import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  AlertTriangle, Shield, CheckCircle, Activity, FileText,
  MapPin, Users, Download, MessageSquare, X, RefreshCw, Layers,
} from 'lucide-react';
import { Logo } from '../components/icons.jsx';
import { go } from '../router.js';
import LedTimer from '../components/LedTimer.jsx';
import {
  fetchLayers,
  fetchRedZones,
  runEngineCompute,
  getCertificateUrl,
  submitCitizenFeedback,
} from '../utils/api.js';
import '../styles/relocation.css';

const PHASE_COLORS = {
  Immediate: '#ef4444',
  'Short-Term': '#f97316',
  'Medium-Term': '#eab308',
};

// 100% Free Open Source Basemap Presets (No API Keys, No Watermarks)
const BASEMAP_PRESETS = {
  gebco: {
    id: 'gebco',
    name: 'GEBCO Physical Relief (Topography)',
    wms: true,
    url: 'https://wms.gebco.net/mapserv?',
    layers: 'GEBCO_LATEST',
    attribution: '&copy; GEBCO / NOAA / IHO / IOC',
    refUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 16,
  },
  osm_dark: {
    id: 'osm_dark',
    name: 'OpenStreetMap Dark (Free OSS)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    className: 'reloc-osm-dark-tiles',
    maxZoom: 19,
  },
  esri_dark: {
    id: 'esri_dark',
    name: 'Esri Dark Canvas (GIS)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    refUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    className: '',
    maxZoom: 16,
  },
  osm_standard: {
    id: 'osm_standard',
    name: 'OpenStreetMap Standard (Light)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    className: '',
    maxZoom: 19,
  },
  opentopo: {
    id: 'opentopo',
    name: 'OpenTopoMap (Topography)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> | &copy; <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a>',
    className: '',
    maxZoom: 17,
  },
};

export default function RelocationDashboard({ lang = 'en', onLang, theme = 'dark', onToggleTheme }) {
  const [layers, setLayers] = useState({ hazards: null, habitations: null, sites: null });
  const [redZones, setRedZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [filterPhase, setFilterPhase] = useState('All');
  const [feedbackModalZone, setFeedbackModalZone] = useState(null);
  const [citizenName, setCitizenName] = useState('');
  const [citizenMessage, setCitizenMessage] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState(null);
  const [toast, setToast] = useState(null);
  const [basemapKey, setBasemapKey] = useState('osm_dark');
  const activeBasemap = BASEMAP_PRESETS[basemapKey] || BASEMAP_PRESETS.osm_dark;
  const [mobileTab, setMobileTab] = useState('map');
  const mapRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [layerData, zonesData] = await Promise.all([
        fetchLayers(),
        fetchRedZones(),
      ]);
      setLayers(layerData);
      setRedZones(zonesData || []);
      if (zonesData && zonesData.length > 0 && !selectedZone) {
        setSelectedZone(zonesData[0]);
      }
    } catch (err) {
      console.error('Error loading relocation data:', err);
      showToast('Error connecting to backend services.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCompute = async () => {
    setComputing(true);
    try {
      const res = await runEngineCompute();
      showToast(`Analytics engine completed: ${res.zones_processed || 0} zones prioritized.`);
      await loadData();
    } catch (err) {
      console.error('Failed to run engine:', err);
      showToast('Engine compute failed. Check backend logs.');
    } finally {
      setComputing(false);
    }
  };

  const handleDownloadCertificate = (zoneId) => {
    const url = getCertificateUrl(zoneId);
    window.open(url, '_blank');
  };

  const handleSendFeedback = async (e) => {
    e.preventDefault();
    if (!citizenName || !citizenMessage) return;
    try {
      await submitCitizenFeedback({
        red_zone_id: feedbackModalZone.id,
        citizen_name: citizenName,
        message: citizenMessage,
      });
      setFeedbackStatus('success');
      setTimeout(() => {
        setFeedbackStatus(null);
        setFeedbackModalZone(null);
        setCitizenName('');
        setCitizenMessage('');
        showToast('Grievance logged successfully into statutory audit log.');
      }, 1200);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      setFeedbackStatus('error');
    }
  };

  // Filtered zones
  const displayedZones = useMemo(() => {
    if (filterPhase === 'All') return redZones;
    return redZones.filter((z) => z.phase === filterPhase);
  }, [redZones, filterPhase]);

  // Statistics
  const stats = useMemo(() => {
    const total = redZones.length;
    const immediate = redZones.filter((z) => z.phase === 'Immediate').length;
    const short = redZones.filter((z) => z.phase === 'Short-Term').length;
    const medium = redZones.filter((z) => z.phase === 'Medium-Term').length;
    const totalExposed = redZones.reduce((acc, z) => acc + (z.exposure_score || 0), 0);
    return { total, immediate, short, medium, totalExposed };
  }, [redZones]);

  // Chart data
  const chartData = useMemo(() => {
    return [...redZones]
      .sort((a, b) => b.priority_score - a.priority_score)
      .slice(0, 10)
      .map((z) => ({
        name: `Zone #${z.habitation_id}`,
        score: z.priority_score,
        phase: z.phase,
      }));
  }, [redZones]);

  // GIS styling
  const hazardStyle = {
    color: '#dc2626',
    weight: 2,
    fillColor: '#ef4444',
    fillOpacity: 0.28,
  };

  const siteStyle = {
    color: '#059669',
    weight: 2,
    fillColor: '#10b981',
    fillOpacity: 0.35,
  };

  const getHabitationStyle = (feature) => {
    const rz = redZones.find((z) => z.habitation_id === feature.properties.id);
    if (!rz) {
      return { color: '#64748b', weight: 1.5, fillColor: '#94a3b8', fillOpacity: 0.2 };
    }
    const color = PHASE_COLORS[rz.phase] || '#eab308';
    const isSel = selectedZone && selectedZone.habitation_id === rz.habitation_id;
    return {
      color: isSel ? '#38bdf8' : color,
      weight: isSel ? 3 : 2,
      fillColor: color,
      fillOpacity: isSel ? 0.8 : 0.55,
    };
  };

  const onEachHabitation = (feature, layer) => {
    const rz = redZones.find((z) => z.habitation_id === feature.properties.id);
    layer.on({
      click: () => {
        if (rz) setSelectedZone(rz);
      },
    });
  };

  return (
    <div className="reloc-container">
      {/* Header Bar */}
      <header className="reloc-header">
        <div className="reloc-brand-group">
          <button className="brand-back" onClick={() => go('/')} title="A.A.R.A.M.B.H Home">
            <Logo size={26} />
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>
              A.A.R.A.M.B.H AI-GIS
            </div>
            <div style={{ fontSize: 11, color: 'var(--br-muted)' }}>
              Atmospheric Analysis &amp; Rapid Alert Monitoring · Carrying Capacity &amp; Relocation
            </div>
          </div>
        </div>

        {/* Navigation Mode Switcher */}
        <div className="reloc-nav-pill">
          <button className="reloc-nav-btn" onClick={() => go('/app')}>
            <Activity size={14} /> Convective Nowcast (0–6h)
          </button>
          <button className="reloc-nav-btn active">
            <Shield size={14} /> Relocation & Carrying Capacity
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LedTimer
            nextInSeconds={300}
            onRefresh={handleCompute}
            size="sm"
            label="CYCLE CADENCE"
          />
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
          <button
            className="reloc-run-btn"
            onClick={handleCompute}
            disabled={computing}
            title="Trigger multi-hazard live fusion and carrying capacity matching"
          >
            <RefreshCw size={15} className={computing ? 'animate-spin' : ''} />
            {computing ? 'Computing Allocations...' : 'RUN ANALYTICS ENGINE'}
          </button>
        </div>
      </header>

      {/* Mobile Mode Switcher: GIS Map vs Prioritization Table */}
      <div className="reloc-mobile-tabs">
        <button
          className={`reloc-mobile-tab-btn ${mobileTab === 'map' ? 'active' : ''}`}
          onClick={() => setMobileTab('map')}
        >
          <MapPin size={13} /> Spatial GIS Map
        </button>
        <button
          className={`reloc-mobile-tab-btn ${mobileTab === 'table' ? 'active' : ''}`}
          onClick={() => setMobileTab('table')}
        >
          <Users size={13} /> Prioritization Table ({redZones.length})
        </button>
      </div>

      {/* Main Content Area */}
      <main className={`reloc-main mobile-tab-${mobileTab}`}>
        {/* Left Column: Stats, Charts, Phasing Matrix */}
        <div className="reloc-left-col">
          {/* Quick Metrics */}
          <div className="reloc-card" style={{ flexShrink: 0 }}>
            <div className="reloc-stats-grid">
              <div className="reloc-stat-box">
                <div className="reloc-stat-val">{stats.total}</div>
                <div className="reloc-stat-lbl">Mapped Zones</div>
              </div>
              <div className="reloc-stat-box" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <div className="reloc-stat-val" style={{ color: '#f87171' }}>{stats.immediate}</div>
                <div className="reloc-stat-lbl">Immediate</div>
              </div>
              <div className="reloc-stat-box" style={{ borderColor: 'rgba(249, 115, 22, 0.3)' }}>
                <div className="reloc-stat-val" style={{ color: '#fb923c' }}>{stats.short}</div>
                <div className="reloc-stat-lbl">Short-Term</div>
              </div>
              <div className="reloc-stat-box" style={{ borderColor: 'rgba(234, 179, 8, 0.3)' }}>
                <div className="reloc-stat-val" style={{ color: '#facc15' }}>{stats.medium}</div>
                <div className="reloc-stat-lbl">Medium-Term</div>
              </div>
            </div>

            {/* Recharts Priority Score */}
            <div style={{ height: 130, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--br-muted)', marginBottom: 4 }}>
                Top Priority Risk Scores
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 2, right: 6, left: -22, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#86868b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#86868b' }} axisLine={false} tickLine={false} />
                  <ChartTooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, borderRadius: 6 }}
                  />
                  <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={PHASE_COLORS[d.phase] || '#38bdf8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Phasing Matrix Table */}
          <div className="reloc-card" style={{ flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Relocation Phasing Matrix</div>
              {/* Phase Filters */}
              <div style={{ display: 'flex', gap: 4 }}>
                {['All', 'Immediate', 'Short-Term', 'Medium-Term'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setFilterPhase(p)}
                    style={{
                      background: filterPhase === p ? 'rgba(255,255,255,0.15)' : 'transparent',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: filterPhase === p ? '#fff' : '#86868b',
                      fontSize: 10,
                      padding: '2px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="reloc-matrix-wrap">
              <table className="reloc-table">
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Score</th>
                    <th>Phase</th>
                    <th>Assigned Site</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedZones.map((z) => {
                    const isSelected = selectedZone && selectedZone.id === z.id;
                    const phaseClass = z.phase === 'Immediate'
                      ? 'badge-immediate'
                      : z.phase === 'Short-Term'
                      ? 'badge-short'
                      : 'badge-medium';
                    return (
                      <tr
                        key={z.id}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => setSelectedZone(z)}
                      >
                        <td style={{ fontWeight: 600 }}>#{z.habitation_id}</td>
                        <td style={{ fontFamily: 'var(--br-font-mono)', fontWeight: 700, color: '#f87171' }}>
                          {z.priority_score.toFixed(1)}
                        </td>
                        <td>
                          <span className={`badge-phase ${phaseClass}`}>{z.phase}</span>
                        </td>
                        <td style={{ fontSize: 11, color: '#94a3b8' }}>
                          {z.assigned_site_id ? `Camp #${z.assigned_site_id}` : 'Over-Capacity'}
                        </td>
                        <td>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadCertificate(z.id);
                            }}
                            style={{
                              background: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              color: '#38bdf8',
                              padding: '2px 7px',
                              borderRadius: 4,
                              fontSize: 11,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                            title="Download Official Certificate PDF"
                          >
                            <FileText size={11} /> PDF
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedZones.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#86868b' }}>
                        No zones found in this phase.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: GIS Map & XAI Explainable Drawer */}
        <div className="reloc-right-col">
          <div className="reloc-map-wrap">
            <MapContainer
              center={[30.316, 78.032]}
              zoom={11}
              style={{ height: '100%', width: '100%' }}
              ref={mapRef}
            >
              {activeBasemap.wms ? (
                <WMSTileLayer
                  key={basemapKey}
                  url={activeBasemap.url}
                  layers={activeBasemap.layers}
                  format="image/png"
                  transparent={false}
                  attribution={activeBasemap.attribution}
                  maxZoom={activeBasemap.maxZoom || 18}
                />
              ) : (
                <TileLayer
                  key={basemapKey}
                  url={activeBasemap.url}
                  attribution={activeBasemap.attribution}
                  className={activeBasemap.className}
                  maxZoom={activeBasemap.maxZoom || 19}
                />
              )}
              {activeBasemap.refUrl && (
                <TileLayer
                  key={`${basemapKey}-ref`}
                  url={activeBasemap.refUrl}
                  attribution=""
                  zIndex={6}
                  maxZoom={activeBasemap.maxZoom || 19}
                />
              )}

              {layers.hazards && (
                <GeoJSON
                  data={layers.hazards}
                  style={hazardStyle}
                  key="hazards-layer"
                />
              )}

              {layers.sites && (
                <GeoJSON
                  data={layers.sites}
                  style={siteStyle}
                  key="sites-layer"
                />
              )}

              {layers.habitations && (
                <GeoJSON
                  data={layers.habitations}
                  style={getHabitationStyle}
                  onEachFeature={onEachHabitation}
                  key={`habs-layer-${redZones.length}-${selectedZone?.id}`}
                />
              )}
            </MapContainer>

            {/* Basemap Switcher (100% Free Open Source) */}
            <div className="reloc-basemap-ctrl">
              <Layers size={13} style={{ color: '#38bdf8' }} />
              <select
                className="reloc-basemap-select"
                value={basemapKey}
                onChange={(e) => setBasemapKey(e.target.value)}
                aria-label="Free Basemap Provider"
              >
                <option value="gebco">GEBCO Relief (Physical Topography)</option>
                <option value="osm_dark">OpenStreetMap Dark (Free OSS)</option>
                <option value="esri_dark">Esri Dark Canvas (GIS)</option>
                <option value="osm_standard">OpenStreetMap Standard</option>
                <option value="opentopo">OpenTopoMap (Topography)</option>
              </select>
              <span className="reloc-oss-badge">FREE OSS</span>
            </div>

            {/* Map Legend */}
            <div className="reloc-legend">
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 11, letterSpacing: '0.04em' }}>
                SPATIAL GIS LAYERS
              </div>
              <div className="reloc-legend-item">
                <div className="reloc-legend-box" style={{ background: 'rgba(239,68,68,0.4)', border: '1px solid #ef4444' }} />
                <span>Hazard Footprints (Landslide/Flood/Outwash)</span>
              </div>
              <div className="reloc-legend-item">
                <div className="reloc-legend-box" style={{ background: 'rgba(16,185,129,0.4)', border: '1px solid #10b981' }} />
                <span>Safe Candidate Camps (Capacity Buffer)</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0' }} />
              <div style={{ fontSize: 10, color: 'var(--br-muted)', marginBottom: 4 }}>PRIORITIZED HABITATIONS</div>
              <div className="reloc-legend-item">
                <div className="reloc-legend-box" style={{ background: '#ef4444' }} />
                <span>Immediate Evacuation Phase</span>
              </div>
              <div className="reloc-legend-item">
                <div className="reloc-legend-box" style={{ background: '#f97316' }} />
                <span>Short-Term Phased Transfer</span>
              </div>
              <div className="reloc-legend-item">
                <div className="reloc-legend-box" style={{ background: '#eab308' }} />
                <span>Medium-Term Monitored Zone</span>
              </div>
            </div>
          </div>

          {/* Explainable AI (XAI) Panel */}
          {selectedZone && (
            <div className="reloc-xai-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <MapPin size={18} color="#38bdf8" />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>
                    Habitation #{selectedZone.habitation_id} — Statutory Assessment
                  </span>
                  <span className={`badge-phase ${
                    selectedZone.phase === 'Immediate' ? 'badge-immediate' :
                    selectedZone.phase === 'Short-Term' ? 'badge-short' : 'badge-medium'
                  }`}>
                    {selectedZone.phase} Phase
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setFeedbackModalZone(selectedZone)}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#f5f5f7',
                      padding: '5px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <MessageSquare size={13} /> Citizen Grievance
                  </button>
                  <button
                    onClick={() => handleDownloadCertificate(selectedZone.id)}
                    style={{
                      background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
                      border: 'none',
                      color: '#050507',
                      padding: '5px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Download size={13} /> Download Legal Certificate (PDF)
                  </button>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="reloc-xai-grid">
                <div className="reloc-stat-box">
                  <div className="reloc-stat-val" style={{ color: '#f87171' }}>
                    {selectedZone.priority_score.toFixed(1)}
                  </div>
                  <div className="reloc-stat-lbl">Priority Score</div>
                </div>
                <div className="reloc-stat-box">
                  <div className="reloc-stat-val">{selectedZone.hazard_score.toFixed(1)}</div>
                  <div className="reloc-stat-lbl">Hazard Score</div>
                </div>
                <div className="reloc-stat-box">
                  <div className="reloc-stat-val">{selectedZone.vulnerability_score.toFixed(1)}/10</div>
                  <div className="reloc-stat-lbl">Vulnerability</div>
                </div>
                <div className="reloc-stat-box">
                  <div className="reloc-stat-val">{Math.round(selectedZone.exposure_score).toLocaleString()}</div>
                  <div className="reloc-stat-lbl">Exposed Pop.</div>
                </div>
                <div className="reloc-stat-box">
                  <div className="reloc-stat-val" style={{ fontSize: 13, color: '#34d399' }}>
                    {selectedZone.assigned_site_id ? `Camp #${selectedZone.assigned_site_id}` : 'Over-Capacity'}
                  </div>
                  <div className="reloc-stat-lbl">Safe Allocation</div>
                </div>
              </div>

              {/* Explainable AI Justification */}
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--br-muted)', marginBottom: 4 }}>
                  Explainable AI (XAI) Justification & Statutory Rationale
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>
                  "{selectedZone.xai_explanation}"
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Citizen Grievance Modal */}
      {feedbackModalZone && (
        <div className="reloc-modal-backdrop" onClick={() => setFeedbackModalZone(null)}>
          <div className="reloc-modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                Citizen Grievance & Ground Feedback — Habitation #{feedbackModalZone.habitation_id}
              </div>
              <button
                onClick={() => setFeedbackModalZone(null)}
                style={{ background: 'transparent', border: 'none', color: '#86868b', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendFeedback}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#86868b', marginBottom: 6 }}>
                  Citizen / Field Officer Name
                </label>
                <input
                  type="text"
                  required
                  value={citizenName}
                  onChange={(e) => setCitizenName(e.target.value)}
                  placeholder="e.g. Ramesh Chandra (Panchayat Member)"
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#86868b', marginBottom: 6 }}>
                  Ground Ground Report / Evacuation Appeal
                </label>
                <textarea
                  rows={4}
                  required
                  value={citizenMessage}
                  onChange={(e) => setCitizenMessage(e.target.value)}
                  placeholder="Detail local ground conditions, slope fractures, or specific medical needs for this zone..."
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: 13,
                  }}
                />
              </div>

              {feedbackStatus === 'success' && (
                <div style={{ color: '#34d399', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={14} /> Grievance logged with official audit hash.
                </div>
              )}

              {feedbackStatus === 'error' && (
                <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} /> Submission failed. Please try again.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setFeedbackModalZone(null)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#86868b',
                    padding: '8px 14px',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: '#2563eb',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 18px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Submit Official Grievance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#1e293b',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontSize: 13,
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Activity size={16} color="#38bdf8" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
