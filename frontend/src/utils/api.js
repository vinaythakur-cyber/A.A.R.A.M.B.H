// BhoomiRakshak frontend — API client, WebSocket URL builder, and shared
// presentation helpers. Codes against the ARCHITECTURE.md backend contract
// (INDIA-ONLY SCOPE): every data endpoint takes ?region=<id>, clocks are IST,
// advisories come in English + Hindi (advisory / advisory_hi).

export const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:8000'
).replace(/\/+$/, '');

// Default country view of India (no world/global views).
export const INDIA_VIEW = { center: [22.8, 79.5], zoom: 5 };
export const INDIA_MAX_BOUNDS = [
  [5.5, 65.5],
  [37.5, 98.5],
];
export const REGION_ZOOM = 10;

// Fallback region presets, taken verbatim from ARCHITECTURE.md. Used only if
// GET /api/regions is unreachable (e.g. older backend); the API is authoritative.
export const REGIONS_FALLBACK = [
  {
    id: 'delhi-ncr',
    name: 'Delhi-NCR',
    center: [28.61, 77.23],
    districts: [
      'Central Delhi',
      'Gurugram',
      'Noida',
      'Faridabad',
      'Ghaziabad',
      'Sonipat',
      'Rohtak',
      'Meerut',
    ],
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    center: [19.08, 72.88],
    districts: [
      'Mumbai City',
      'Mumbai Suburban',
      'Thane',
      'Palghar',
      'Raigad',
      'Navi Mumbai',
    ],
  },
  {
    id: 'chennai',
    name: 'Chennai',
    center: [13.08, 80.27],
    districts: [
      'Chennai',
      'Kanchipuram',
      'Chengalpattu',
      'Tiruvallur',
      'Ranipet',
    ],
  },
  {
    id: 'kolkata',
    name: 'Kolkata',
    center: [22.57, 88.36],
    districts: [
      'Kolkata',
      'Howrah',
      'North 24 Parganas',
      'South 24 Parganas',
      'Hooghly',
    ],
  },
  {
    id: 'bengaluru',
    name: 'Bengaluru',
    center: [12.97, 77.59],
    districts: [
      'Bengaluru Urban',
      'Bengaluru Rural',
      'Tumakuru',
      'Kolar',
      'Ramanagara',
    ],
  },
  {
    id: 'hyderabad',
    name: 'Hyderabad',
    center: [17.38, 78.48],
    districts: [
      'Hyderabad',
      'Medchal-Malkajgiri',
      'Rangareddy',
      'Sangareddy',
    ],
  },
  {
    id: 'ahmedabad',
    name: 'Ahmedabad',
    center: [23.03, 72.58],
    districts: ['Ahmedabad', 'Gandhinagar', 'Kheda', 'Anand'],
  },
  {
    id: 'lucknow',
    name: 'Lucknow',
    center: [26.85, 80.95],
    districts: ['Lucknow', 'Barabanki', 'Sitapur', 'Unnao', 'Hardoi'],
  },
];

export const DEFAULT_REGION = 'delhi-ncr';

export const HAZARD_META = {
  lightning: { label: 'Lightning', labelHi: 'बिजली', icon: '⚡' },
  hail: { label: 'Hail', labelHi: 'ओले', icon: '🧊' },
  downburst: { label: 'Downburst', labelHi: 'अधोमुखी झोंका', icon: '💨' },
  cloudburst: { label: 'Cloudburst', labelHi: 'बादल फटना', icon: '🌧️' },
};

export function hazardLabel(hazard, lang = 'en') {
  const m = HAZARD_META[hazard];
  if (!m) return hazard;
  return lang === 'hi' ? m.labelHi : m.label;
}

export const SEVERITY_COLORS = {
  yellow: '#facc15',
  orange: '#fb923c',
  red: '#ef4444',
  green: '#22c55e',
};

export function wsUrl() {
  const base =
    API_URL || `${window.location.protocol}//${window.location.host}`;
  return base.replace(/^http/i, 'ws') + '/ws/live';
}

export async function apiFetch(path, { timeoutMs = 9000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Append ?region=<id> to a data-endpoint path (contract: default delhi-ncr). */
export function withRegion(path, regionId) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}region=${encodeURIComponent(
    regionId || DEFAULT_REGION,
  )}`;
}

/** Format an ISO8601 timestamp in Asia/Kolkata, always labeled IST. */
export function formatIST(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return (
      new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata',
      }).format(d) + ' IST'
    );
  } catch {
    return '—';
  }
}

export function addMinutesISO(iso, minutes) {
  if (!iso) return null;
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

// Classic weather-radar reflectivity colour ramp (dBZ).
const DBZ_STOPS = [
  [5, [94, 185, 255]],
  [15, [59, 130, 246]],
  [20, [34, 211, 238]],
  [30, [34, 197, 94]],
  [40, [132, 204, 22]],
  [45, [234, 179, 8]],
  [50, [249, 115, 22]],
  [55, [239, 68, 68]],
  [60, [220, 38, 38]],
  [65, [168, 85, 247]],
  [70, [216, 180, 254]],
  [75, [253, 244, 255]],
];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

export function dbzColor(dbz) {
  if (dbz == null || Number.isNaN(dbz) || dbz < 5) return null;
  if (dbz <= DBZ_STOPS[0][0]) return DBZ_STOPS[0][1];
  for (let i = 1; i < DBZ_STOPS.length; i++) {
    if (dbz <= DBZ_STOPS[i][0]) {
      const [z0, c0] = DBZ_STOPS[i - 1];
      const [z1, c1] = DBZ_STOPS[i];
      const t = (dbz - z0) / (z1 - z0);
      return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    }
  }
  return DBZ_STOPS[DBZ_STOPS.length - 1][1];
}

// Render the 96×96 dBZ grid to a data-URL heatmap for Leaflet ImageOverlay.
// Assumption (verify at integration): grid[row][col] with row 0 = north edge,
// Backend sends grid row 0 = south edge (see backend/app/config.py region_cell_to_latlon).
// Canvas/Leaflet image row 0 = north, so we read rows bottom-up here.
const ROW0_NORTH = false;

export function renderRadarDataUrl(radar, upscale = 480) {
  if (!radar || !Array.isArray(radar.grid) || radar.grid.length === 0)
    return null;
  const rows = radar.grid.length;
  const cols = Array.isArray(radar.grid[0]) ? radar.grid[0].length : 0;
  if (!cols) return null;

  const src = document.createElement('canvas');
  src.width = cols;
  src.height = rows;
  const sctx = src.getContext('2d');
  const img = sctx.createImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    const row = radar.grid[ROW0_NORTH ? r : rows - 1 - r];
    for (let c = 0; c < cols; c++) {
      const col = dbzColor(row ? row[c] : null);
      const i = (r * cols + c) * 4;
      if (col) {
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = 235;
      } else {
        img.data[i + 3] = 0;
      }
    }
  }
  sctx.putImageData(img, 0, 0);

  const dst = document.createElement('canvas');
  dst.width = upscale;
  dst.height = Math.round((upscale * rows) / cols);
  const dctx = dst.getContext('2d');
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = 'high';
  dctx.drawImage(src, 0, 0, dst.width, dst.height);
  return dst.toDataURL('image/png');
}

export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* =========================================================================
   Disaster Relocation & Carrying Capacity API Methods
   ========================================================================= */

export async function fetchLayers() {
  const [hazards, habitations, sites] = await Promise.all([
    apiFetch('/api/layers/hazards'),
    apiFetch('/api/layers/habitations'),
    apiFetch('/api/layers/candidate-sites'),
  ]);
  return { hazards, habitations, sites };
}

export async function fetchRedZones() {
  return apiFetch('/api/red-zones');
}

export async function runEngineCompute() {
  return apiFetch('/api/engine/compute', { method: 'POST' });
}

export function getCertificateUrl(zoneId) {
  return `${API_URL}/api/red-zones/${zoneId}/certificate`;
}

export async function submitCitizenFeedback(feedback) {
  return apiFetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedback),
  });
}
