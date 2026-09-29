# A.A.R.A.M.B.H — Atmospheric Analysis & Rapid Alert Monitoring for Bursts & Hazards
### Backend Services — Bharat Convective Nowcasting & Disaster Resilience (SIH26084)

FastAPI service implementing the convective-scale nowcasting pipeline for
**8 Indian metro windows**: **ingest → optical-flow nowcast → 4 hazard heads → GeoJSON polygons → WebSocket push**.

Regions (each 1.2°×1.2° @ 120×120, ~1 km/cell): `delhi-ncr`, `mumbai`,
`chennai`, `kolkata`, `bengaluru`, `hyderabad`, `ahmedabad`, `lucknow`.
All timestamps are **Asia/Kolkata (IST)**, ISO8601 with `+05:30`. Every hazard
feature and district card carries `advisory` (English) + `advisory_hi` (Hindi)
using IMD colour-code language (Yellow — Be Aware / Orange — Be Prepared /
Red — Take Action), referencing DDMA / district administration.

## Quickstart

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --port 8000
```

One inference cycle per region runs immediately on startup (concurrent
threads), so every endpoint is live within ~1 min without waiting for the
5-minute scheduler tick.

Docker: `docker build -t bhoomi-backend . && docker run -p 8000:8000 bhoomi-backend`
(also wired into the top-level `docker-compose.yml`).

## Data sources (India-first)

| Source | Data used | Access | Status |
|---|---|---|---|
| IMD Mausam / mausam.imd.gov.in | Official warnings, colour-coded alerts | Public portal | VERIFIED |
| IMD DWR network (via pyiwr) | Doppler radar reflectivity mosaics | Institutional | REQUEST |
| INSAT-3D/3DR via MOSDAC (ISRO) | Satellite cloud imagery | Registered access | REGISTER |
| IITM Pune lightning detection network | Lightning flash locations | Research collaboration | REQUEST |
| NCMRWF (MoES) | NWP guidance fields | Institutional | REQUEST |
| IMD API portal | Station observations | API key on registration | REGISTER |
| ISRO Bhuvan | Base map tiles (frontend) | Public WMS | VERIFIED |
| Open-Meteo (global NWP, no auth) | CAPE / CIN / precipitation / 850 hPa wind — *live demo feed* | Public, no key | VERIFIED |
| International radar/satellite archives (e.g. NEXRAD, OPERA, Himawari) | **Pretraining / prototyping substitutes only** — never operational | Varies | — |

Current demo: Open-Meteo real convective parameters drive a clearly-labeled
synthetic storm simulator standing in for DWR/INSAT/lightning feeds; the
production path swaps in the India-first sources above with no API change.

## Pipeline

1. **Ingest** (`app/ingest/`) — per region
   - `open_meteo.py` — real CAPE / CIN / precipitation + 850 hPa steering wind
     for each region centre (no API key). Cached per region on disk, refreshed
     every 30 min; falls back to cache, then climatology.
   - `storm_sim.py` — **DEMO STAND-IN** for DWR/INSAT/lightning feeds:
     deterministic (per-region seeded) synthetic storm lifecycle simulator.
     Spawn rate and intensity driven by *real* Open-Meteo CAPE/CIN; cells
     steered by *real* 850 hPa wind. Outputs a 120×120 dBZ grid per region.
2. **Nowcast** (`app/nowcast/`) — per region
   - `optical_flow.py` — dense Farneback flow between the last two dBZ frames
     (Lagrangian persistence; cannot predict initiation/decay — documented
     Stage-1 limitation).
   - `extrapolate.py` — semi-Lagrangian advection forward 24 × 15-min steps.
3. **Hazards** (`app/hazards/`) — calibrated heuristics per `ARCHITECTURE.md`:
   - `lightning.py`: `a·exp(b·Z)·sigmoid(CAPE/1500)·(1+CIN_factor)` → flashes/km²/hr
   - `hail.py`: `logistic(0.25·(Z−55) + 0.002·CAPE − 1.2)` → probability
   - `downburst.py`: `BASE + c1·|∇dBZ| + c2·divergence(flow)` → gust km/h
   - `cloudburst.py`: Marshall–Palmer Z→R; R≥100 mm/h sustained over the 60-min
     window → probability = fraction of window steps exceeding
   - `polygons.py` — marching-squares contour tracing → GeoJSON with contract
     properties + `advisory_hi` (Hindi), IMD colour-code wording.
4. **Relocation & Carrying Capacity Engine** (`app/relocation/`)
   - `models.py` / `database.py` — SQLite/PostGIS schema: `hazard_zones`, `habitations`, `candidate_sites`, `red_zones`, `feedback`, `legal_certificates`.
   - `engine.py` — GeoPandas spatial intersection overlay: computes cumulative hazard intensity, socio-demographic vulnerability factor, priority score, and greedy allocation to candidate safe camps.
   - `pdf_gen.py` — dynamic ReportLab statutory relocation directive generation with cryptographic SHA-256 blockchain audit hash.
   - `routes.py` — full REST API for layers, engine execution, grievances, and certificates.
5. **Store** (`app/store.py`) — SQLite cycle archive keyed by (region, cycle)
   + per-region in-memory latest cache.
6. **Scheduler** (`app/ingest/scheduler.py`) — asyncio loop, every
   `BH_CYCLE_INTERVAL_S` (default 300 s): all regions cycle concurrently →
   WS broadcast `{"event":"new_cycle","region":...}`.

## API (base `http://localhost:8000`)

Data endpoints accept `?region=<id>` (default `delhi-ncr`).

| Endpoint | Notes |
|---|---|
| `GET /api/regions` | `[{id, name, center:[lat,lon], districts:[{name,lat,lon}]}]` |
| `GET /api/health` | `{"status","last_cycle","mode","regions","default_region"}` |
| `GET /api/hazards/latest` | GeoJSON, lead=0 analysis polygons |
| `GET /api/forecast/{lead_min}` | GeoJSON; `lead_min` ∈ 0,15,…,360 (400 otherwise) |
| `GET /api/radar/latest` | 96×96 dBZ grid + region bounds + resolution |
| `GET /api/districts` | 6–8 districts/region: hazard, severity, arrival_minutes, probability, advisory, advisory_hi |
| `GET /api/cycle` | cycle_id, valid_time, next_cycle_in_s, hazard_counts, region |
| `GET /api/verification` | reads `../verification/results.json` if present |
| `WS /ws/live` | pushes `new_cycle` event per region per cycle |
| `GET /api/layers/hazards` | GeoJSON multi-hazard footprints (landslide, flood, outwash) |
| `GET /api/layers/habitations` | GeoJSON habitations with socio-demographic vulnerability |
| `GET /api/layers/candidate-sites` | GeoJSON candidate safe relief sites with carrying capacity |
| `POST /api/engine/compute` | Triggers AI-GIS spatial fusion & carrying capacity allocation |
| `GET /api/red-zones` | Prioritized habitations ranked into Immediate, Short, Medium phases with XAI justifications |
| `POST /api/feedback` | Citizen grievance & ground status reporting |
| `GET /api/red-zones/{id}/certificate` | Dynamic ReportLab PDF legal certificate with SHA-256 audit hash |

## Configuration (env vars)

| Var | Default | Meaning |
|---|---|---|
| `BH_CYCLE_INTERVAL_S` | 300 | ingest+inference cadence |
| `BH_PARAMS_REFRESH_S` | 1800 | Open-Meteo refresh cadence |
| `BH_GRID_SPAN_DEG` / `BH_GRID_N` | 1.2 / 120 | window size / resolution |
| `BH_HORIZON_H` / `BH_STEP_MIN` | 6 / 15 | forecast horizon / step |
| `BH_DEFAULT_REGION` | delhi-ncr | default `?region=` |
| `BH_DATA_DIR` | `backend/data` | SQLite + cache dir |
| `BH_MODE` | live | reported in `/api/health` |

## Layout

```
app/
├── main.py            # FastAPI app, routes, /ws/live
├── config.py          # grid domain, cycle timing, env-overridable settings
├── schemas.py         # pydantic response models
├── store.py           # SQLite archive + in-memory latest cache
├── ingest/
│   ├── open_meteo.py  # real CAPE/CIN/precip/850hPa wind (no auth)
│   ├── storm_sim.py   # DEMO synthetic storm simulator (seeded, CAPE-driven)
│   └── scheduler.py   # 5-min asyncio cycle + WS broadcast
├── nowcast/
│   ├── optical_flow.py  # Farneback dense flow
│   └── extrapolate.py   # semi-Lagrangian advection, 24 steps
└── hazards/
    ├── lightning.py hail.py downburst.py cloudburst.py  # 4 heads
    └── polygons.py    # marching squares → GeoJSON
```
