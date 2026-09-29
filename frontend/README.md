# A.A.R.A.M.B.H Frontend — Atmospheric Analysis & Rapid Alert Monitoring for Bursts & Hazards

React + Three.js 3D + Vite marketing site + live convective operations and AI-GIS relocation dashboard for SIH26084.
Apple-grade glassmorphic aesthetic with real-time 3D rain simulation, driven by the live nowcast API.

## Routes

- `#/` — marketing landing page (hero with live storm canvas, stats ticker,
  8-metro live strip, hazard cards, pipeline, verification, data story)
- `#/app` — full live convective operations dashboard (map, radar, districts, alerts)
- `#/relocation` — AI-GIS disaster relocation & carrying capacity dashboard (spatial multi-hazard layers, habitations, safe camps, XAI justifications, legal certificate generation)

Hash routing (`#/` / `#/app` / `#/relocation`) keeps all views working from any static server;
`npm run build` also writes `dist/app/index.html` (postbuild) so `/app`
returns 200 directly. The dashboard chunks (Leaflet, Recharts) are lazy-loaded.

## Quickstart

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build       # outputs dist/
```

Point at a non-default backend:

```bash
VITE_API_URL=http://192.0.2.10:8000 npm run dev
```

(`VITE_API_URL` defaults to `http://localhost:8000`.)

Docker:

```bash
docker build -t bhoomirakshak-frontend .
docker run -p 8080:80 bhoomirakshak-frontend
```

## Features

- **Region selector** — 8 Indian metro nowcast windows (Delhi-NCR, Mumbai,
  Chennai, Kolkata, Bengaluru, Hyderabad, Ahmedabad, Lucknow) from
  `GET /api/regions`; every data call passes `?region=<id>`; map recenters per
  region. Default view is India (country view), max-bounded to the subcontinent.
- **Live hazard polygons** — GeoJSON from `/api/hazards/latest`, refreshed on
  WebSocket `/ws/live` `new_cycle` pushes with a 60 s poll fallback.
  Severity colors follow IMD color codes (Yellow/Watch, Orange/Alert,
  Red/Warning); per-hazard layer toggles (lightning, hail, downburst,
  cloudburst).
- **Radar reflectivity overlay** — 96×96 dBZ grid from `/api/radar/latest`
  rendered to a canvas heatmap with a classic weather-radar color ramp, shown as a
  Leaflet `ImageOverlay` with opacity control. Grid orientation assumption:
  `grid[0]` = north edge — flip `ROW0_NORTH` in `src/utils/api.js` if the
  backend sends row 0 = south.
- **Time slider** — scrubs the 0→6 h forecast in 15-min steps via
  `/api/forecast/{lead_min}`, with an IST "valid time" readout and play mode.
- **District panel** — per-region districts from `/api/districts` with live
  countdowns ("Storm arriving in NN min"), severity badges, probability bars,
  and advisories.
- **English / Hindi toggle** — advisories switch between `advisory` and
  `advisory_hi`; chrome labels translate too.
- **IMD vs BhoomiRakshak** — toggle overlays simulated IMD-style warning
  polygons, always labeled *"Simulated IMD reference — illustrative only"*.
- **Alert signup** — per-district modal (name + phone/email), persisted in
  `localStorage`; delivery is simulated.
- **Base maps** — OpenStreetMap default + ISRO **Bhuvan WMS** toggle
  (`https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms`, LULC 50K layer per state
  following Bhuvan's documented naming convention; layer ids may need a tweak
  against the live catalog).
- **Backend-offline state** — if the API is unreachable the dashboard shows a
  clean banner and the base map instead of stale data.

## Data sources (India-first)

| Source | Role | Access |
|---|---|---|
| IMD Doppler Weather Radar (via pyiwr) | Reflectivity / velocity (production path) | REQUEST |
| MOSDAC / INSAT-3D | Satellite convection proxies | REGISTER |
| IITM lightning detection network | Lightning ground truth | REQUEST |
| NCMRWF | NWP guidance fields | REGISTER |
| IMD API portal | Official warnings reference | REGISTER |
| Open-Meteo | Convective parameters (CAPE/CIN) — prototyping seed | VERIFIED |
| ISRO Bhuvan (NRSC) WMS | Indian base map | VERIFIED |
| OpenStreetMap | Fallback base map | VERIFIED |

Demo-mode disclaimer (also in the app footer): *simulated radar seeded by live
Open-Meteo convective data.* International feeds (Himawari, NEXRAD, OPERA) are
documented strictly as pretraining/prototyping substitutes — none appear in the
UI.

## Contract notes for the backend team

- Implements `ARCHITECTURE.md` exactly: `/api/regions`, `?region=` on the five
  data endpoints, `advisory`/`advisory_hi` on hazards and districts, IST
  timestamps.
- `/api/cycle` `hazard_counts` is rendered generically (`Object.entries`), so
  any `{severity: count}` shape works.
- If `GET /api/regions` is unavailable, the dashboard falls back to the eight
  presets from `ARCHITECTURE.md` (`REGIONS_FALLBACK` in `src/utils/api.js`).

## Dependencies (pinned)

react 18.3.1 · react-dom 18.3.1 · react-leaflet 4.2.1 · leaflet 1.9.4 ·
vite 5.4.11 · @vitejs/plugin-react 4.3.4
