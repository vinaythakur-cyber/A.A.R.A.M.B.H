# BhoomiRakshak — SIH26084 Convective Nowcasting System
## Architecture Contract (shared by all builders — do not break)

Project root: `~/workspace/sih26084-nowcasting/`

```
sih26084-nowcasting/
├── backend/                 # FastAPI unified service
│   ├── app/
│   │   ├── main.py          # Unified FastAPI app factory, routers, WS
│   │   ├── config.py        # Settings, paths, metro regions
│   │   ├── ingest/          # Ingest workers: open_meteo.py, storm_sim.py, scheduler.py
│   │   ├── nowcast/         # Optical flow (Farneback), semi-Lagrangian advection
│   │   ├── hazards/         # Lightning, hail, downburst, cloudburst, polygons
│   │   ├── store.py         # SQLite archive + in-memory cache
│   │   └── relocation/      # AI-GIS Relocation & Carrying Capacity Engine
│   │       ├── database.py  # SQLite/PostGIS database session
│   │       ├── models.py    # HazardZone, Habitation, CandidateSite, RedZone, LegalCertificate
│   │       ├── engine.py    # Spatial fusion, vulnerability index, capacity matching
│   │       ├── crud.py      # GeoJSON layer generators
│   │       ├── pdf_gen.py   # ReportLab statutory certificate generator with SHA-256
│   │       ├── schemas.py   # Pydantic schemas
│   │       └── routes.py    # Relocation API endpoints
│   ├── data/                # open_meteo cache & bhoomi_rakshak.db
│   ├── requirements.txt
│   ├── Dockerfile
│   └── README.md
├── frontend/                # React + Vite + Leaflet + Recharts dashboard
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.jsx              # Unified Public Portal & Mission Overview
│   │   │   ├── Dashboard.jsx            # 0–6h Convective Nowcasting Ops Center
│   │   │   └── RelocationDashboard.jsx  # AI-GIS Relocation & Carrying Capacity Cockpit
│   │   ├── components/ ...
│   │   ├── styles/ ...
│   │   └── utils/ ...
│   ├── Dockerfile
│   └── README.md
├── verification/            # Metrics + case studies (CSI, POD, FAR, HSS, FSS)
├── docker-compose.yml       # backend:8000, frontend:80
└── README.md                # Top-level: what it is, quickstart, demo walkthrough
```

## Unified Dual-Pillar Architecture
BhoomiRakshak merges two mission-critical pillars into one integrated national platform:
1. **Pillar 1: Convective-Scale Nowcasting (0–6 Hours)**:
   - High-resolution (~1 km) storm motion advection via Farneback optical flow.
   - 4 calibrated hazard heads: Lightning flash density, Hail probability, Downburst gusts, and Cloudburst accumulation.
   - 8 Indian metro windows, IST clocks, bilingual (English + Hindi) IMD colour-coded advisories.
2. **Pillar 2: AI-GIS Disaster Relocation & Carrying Capacity Planning**:
   - Multi-hazard spatial overlay (landslides, flash floods, erosion) intersecting census habitations.
   - Socio-demographic vulnerability scoring (elderly %, disabled %, housing quality, income bracket).
   - Priority index ranking habitations into Immediate, Short-Term, and Medium-Term action phases.
   - Explainable AI (XAI) transparent audit justifications.
   - Greedy carrying capacity matching with safe candidate relief sites.
   - Dynamically generated official legal certificates with cryptographic SHA-256 blockchain audit hash.

## Domain (Delhi-NCR demo region, extendable)
- Grid: 1.2° × 1.2° centered on Delhi (28.61N, 77.23E) → 27.99–29.21N, 76.63–77.83E
- Grid resolution: 120 × 120 cells ≈ 1 km/cell
- Cycle: ingest every 5 min, inference every 5 min (configurable to 15), forecast horizon 6 h in 15-min steps (24 steps)
- Live mode: Open-Meteo real CAPE/CIN/precip (no auth) + storm simulator seeded by real convective params
- Storm simulator = deterministic synthetic storm lifecycle (initiation → mature → dissipate) advected by 850 hPa wind; it stands in for DWR/INSAT/lightning feeds in the demo and is clearly labeled as such.

## INDIA-ONLY SCOPE (binding for all builders)
This system is India-only in identity, data, and presentation. No global views, no US/EU demo regions.
- **Region presets (all India):** the nowcast runs per metro window, each 1.2°×1.2° @ ~1km (120×120):
  `delhi-ncr` (28.61,77.23), `mumbai` (19.08,72.88), `chennai` (13.08,80.27),
  `kolkata` (22.57,88.36), `bengaluru` (12.97,77.59), `hyderabad` (17.38,78.48),
  `ahmedabad` (23.03,72.58), `lucknow` (26.85,80.95)
- Backend runs the ingest→nowcast→hazard cycle for every configured region each tick (cheap at 120×120) and caches latest per region.
- **API change:** data endpoints accept `?region=<id>` (default `delhi-ncr`):
  `/api/hazards/latest`, `/api/forecast/{lead_min}`, `/api/radar/latest`, `/api/districts`, `/api/cycle`
  New endpoint: `GET /api/regions` → `[{id, name, center:[lat,lon], districts:[...]}]`
- **Districts:** each region serves 6–8 real Indian districts/cities (e.g. delhi-ncr: Central Delhi, Gurugram, Noida, Faridabad, Ghaziabad, Sonipat, Rohtak, Meerut; mumbai: Mumbai City, Mumbai Suburban, Thane, Palghar, Raigad, Navi Mumbai …). District list comes from `/api/regions` + `/api/districts`.
- **Timezone:** Asia/Kolkata (IST) everywhere — API timestamps, frontend clocks, countdowns. Serialize ISO8601 with +05:30.
- **Advisories:** English + Hindi (`advisory` and `advisory_hi` in every hazard feature and district card). Use IMD terminology: severity maps to IMD color codes; advisories reference DDMA / district administration / IMD bulletins.
- **Base maps:** OSM default + ISRO **Bhuvan WMS** toggle (Indian base map, per briefing). Map default view = India (not world).
- **Data sources:** India-first stack (IMD DWR via pyiwr, MOSDAC/INSAT-3D, IITM lightning network, NCMRWF, IMD API portal) as the documented production path; international sources (Himawari, NEXRAD, OPERA) labeled strictly as pretraining/prototyping substitutes. README data-source table must carry the access-status column (VERIFIED/REGISTER/REQUEST) from the briefing.
- **Verification case studies:** Indian events only — 2023 Himachal cloudbursts, 2024 Delhi-NCR pre-monsoon dust storm / hail event, and a Bay-of-Bengal-coast squall line (Chennai/Kolkata window).
- **Branding/copy:** "BhoomiRakshak — Bharat Convective Nowcasting". No non-Indian place names anywhere in UI or docs.

## Backend API contract (frontend depends on this — implement exactly)
Base URL default `http://localhost:8000`

| Method | Path | Response |
|---|---|---|
| GET | `/api/health` | `{"status":"ok","last_cycle": "<ISO8601>", "mode": "live|demo"}` |
| GET | `/api/regions` | `[{id, name, center:[lat,lon], districts:[...]}]` |
| GET | `/api/hazards/latest` | GeoJSON FeatureCollection, polygons for lead=0 (current analysis) |
| GET | `/api/forecast/{lead_min}` | GeoJSON FeatureCollection for that lead time; `lead_min` ∈ {0,15,...,360} |
| GET | `/api/radar/latest` | `{"bounds":[[s,w],[n,e]], "grid":[[dBZ...],...], "resolution_km":1.0, "valid_time":"..."}` grid is 96×96 |
| GET | `/api/districts` | `[{district, hazard, severity, arrival_minutes, probability, advisory}]` for 8 NCR districts |
| GET | `/api/cycle` | `{"cycle_id":N,"valid_time":...,"next_cycle_in_s":N,"hazard_counts":{...}}` |
| GET | `/api/verification` | metrics summary JSON (wired to verification module) |
| WS | `/ws/live` | pushes `{"event":"new_cycle","cycle_id":N,"valid_time":...,"counts":{...}}` on each inference cycle |
| GET | `/api/layers/hazards` | GeoJSON FeatureCollection of multi-hazard spatial footprints (landslide, flood, outwash) |
| GET | `/api/layers/habitations` | GeoJSON FeatureCollection of habitations with socio-demographic vulnerability metadata |
| GET | `/api/layers/candidate-sites` | GeoJSON FeatureCollection of safe candidate relief camps with maximum capacity |
| POST | `/api/engine/compute` | Triggers spatial fusion, vulnerability index, and greedy carrying capacity allocation |
| GET | `/api/red-zones` | List of prioritized habitations ranked into Immediate, Short-Term, Medium-Term phases with XAI justifications |
| POST | `/api/feedback` | Citizen grievance / ground status submission logged to database |
| GET | `/api/red-zones/{id}/certificate` | Dynamic ReportLab PDF legal relocation certificate with SHA-256 blockchain hash |

## GeoJSON hazard feature properties (exact keys)
```json
{
  "type": "Feature",
  "geometry": {"type": "Polygon", "coordinates": [...]},
  "properties": {
    "hazard": "lightning|hail|downburst|cloudburst",
    "severity": "yellow|orange|red",
    "probability": 0.0-1.0,
    "intensity": "<human string, e.g. '42 flashes/km²/hr' | '72% hail prob' | '95 km/h gusts' | '110 mm/h'>",
    "lead_minutes": 0,
    "valid_time": "ISO8601",
    "cell_id": "C-012",
    "eta_minutes": 32,
    "advisory": "short public advisory text"
  }
}
```

## Hazard head physics (implement honestly, document as calibrated heuristics)
1. **lightning** density (flashes/km²/hr) = a·exp(b·Zmax)·sigmoid(CAPE/1500)·(1+CIN_factor); severity from flashes: >30 yellow, >80 orange, >150 red
2. **hail** probability = logistic(0.25·(Zmax−55) + 0.002·CAPE − 1.2); severity: >0.35 yellow, >0.6 orange, >0.8 red
3. **downburst** gust (km/h) = c1·dBZ_gradient + c2·velocity_divergence_proxy; severity: >70 yellow, >90 orange, >110 red
4. **cloudburst** = predicted rain rate (Z→R Marshall-Palmer) ≥100 mm/h sustained over 60-min window → red if p>0.6, orange if 0.35–0.6

Nowcast engine: dense Farneback optical flow on reflectivity grid between last 2 frames → semi-Lagrangian advection forward 24 steps. Hazard heads run on advected fields → polygons via contour tracing (marching squares) at severity thresholds.

## Frontend must-haves (SIH judges checklist)
1. Live storm cells as polygons moving on the map (updates via WS, poll fallback)
2. Countdown timer per district ("Storm arriving in 32 min")
3. Severity colors yellow/orange/red per hazard, layer toggles per hazard type
4. Time slider scrubbing forecast 0→6 h
5. Alert signup per district (localStorage, simulated SMS/email)
6. Comparison layer: "IMD official warnings" vs "BhoomiRakshak" side-by-side toggle (IMD layer = mock from briefing; labeled as simulated)

## Verification module
metrics.py with: CSI, POD, FAR, HSS, FSS (neighborhood), Brier score, reliability bins. run_case_studies.py: 3 synthetic case studies (cloudburst event, hailstorm, squall line) comparing nowcast vs persistence baseline, outputting JSON + VERIFICATION_REPORT.md. Backend `/api/verification` reads the JSON.

## Rules for all agents
- No invented credentials or API keys. No secrets in code.
- Everything must run from `docker compose up --build` AND from plain `uvicorn`/`npm run dev`.
- Pin dependencies. Keep backend light: fastapi, uvicorn, numpy, opencv-python-headless, scikit-image, shapely, requests, pydantic, websockets. Avoid torch in backend (DGMR is documented as future work; optical flow is the Stage-1 baseline per briefing).
- Write a README in your directory. Comment the physics.
