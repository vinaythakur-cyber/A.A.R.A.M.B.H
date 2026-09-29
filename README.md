# A.A.R.A.M.B.H — Atmospheric Analysis & Rapid Alert Monitoring for Bursts & Hazards
### Bharat Disaster Resilience & Convective Nowcasting Platform (SIH26084 · SIH26191)

**A.A.R.A.M.B.H (Atmospheric Analysis & Rapid Alert Monitoring for Bursts & Hazards)** is a unified, end-to-end operational platform fusing real-time convective nowcasting (0–6 h lead, ~1 km resolution) with AI-GIS disaster relocation & carrying capacity planning for DDMA, SDMA, and NDRF authorities.

Severe thunderstorms, cloudbursts, hail, lightning, landslides, and flash floods kill thousands every year — yet warnings and relocation decisions often reach district control rooms late and disconnected. **A.A.R.A.M.B.H** unifies two mission-critical pillars:
1. **Pillar 1: Convective Nowcasting (0–6 h)** — Every 5 minutes, dense Farneback optical flow advects storm cells across **8 Indian metro windows**, generating **hazard polygons with IMD yellow/orange/red colour codes and bilingual (English + Hindi) advisories**.
2. **Pillar 2: AI-GIS Relocation & Carrying Capacity Engine** — Fuses spatial multi-hazard zones with census habitations and demographic vulnerability (elderly %, disability %, Kutcha housing), ranks habitations into **Immediate, Short-Term, and Medium-Term action phases**, allocates residents to safe candidate camps with carrying capacity constraints, and generates **statutory legal certificates with SHA-256 blockchain audit hashes**.

> **Status: working prototype.** Full end-to-end pipeline is operational: live Open-Meteo atmospheric forcing, synthetic storm simulator standing in for institutional radar/satellite feeds, Farneback optical flow, 4 hazard heads, GeoPandas spatial carrying capacity engine, dynamic ReportLab certificate generation, and an interactive 3D glassmorphic GIS dashboard.

**Live demo:** [a-a-r-a-m-b-h.vercel.app](https://a-a-r-a-m-b-h.vercel.app)

## Unified Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   A.A.R.A.M.B.H PLATFORM                                │
└──────────────────────────┬──────────────────────────────────────────┬───────────────────┘
                           │                                          │
              PILLAR 1: CONVECTIVE NOWCAST (0–6H)       PILLAR 2: AI-GIS RELOCATION & XAI
                           │                                          │
            ┌──────────────┴──────────────┐            ┌──────────────┴──────────────┐
            │   8 Metro Windows (~1 km)   │            │   Multi-Hazard GIS Layers   │
            │  Delhi-NCR · Mumbai · ...   │            │  Landslide · Flood · Outwash│
            └──────────────┬──────────────┘            └──────────────┬──────────────┘
                           ▼                                          ▼
            ┌─────────────────────────────┐            ┌─────────────────────────────┐
            │  Farneback Optical Flow     │            │  Demographic Vulnerability  │
            │  Semi-Lagrangian Advection  │            │  Elderly % · Kutcha Housing │
            └──────────────┬──────────────┘            └──────────────┬──────────────┘
                           ▼                                          ▼
            ┌─────────────────────────────┐            ┌─────────────────────────────┐
            │  4 Calibrated Hazard Heads  │            │  Priority & Carrying Cap.   │
            │  Lightning · Hail · Wind    │            │  Greedy Safe-Camp Allocation│
            │  Cloudburst                 │            │  Immediate / Short / Medium │
            └──────────────┬──────────────┘            └──────────────┬──────────────┘
                           │                                          │
                           ▼                                          ▼
            ┌─────────────────────────────┐            ┌─────────────────────────────┐
            │  GeoJSON Hazard Polygons    │            │  Statutory Legal Directives │
            │  Bilingual EN/HI Advisories │            │  ReportLab PDF + SHA-256    │
            └──────────────┬──────────────┘            └──────────────┬──────────────┘
                           │                                          │
                           └──────────────────┬───────────────────────┘
                                              ▼
                        ┌───────────────────────────────────────────┐
                        │      UNIFIED FASTAPI BACKEND (:8000)      │
                        │    SQLite / PostGIS · WebSocket /ws/live  │
                        └─────────────────────┬─────────────────────┘
                                              ▼
                        ┌───────────────────────────────────────────┐
                        │       REACT + LEAFLET GIS DASHBOARD       │
                        │  #/ Landing · #/app Nowcast · #/relocation│
                        └───────────────────────────────────────────┘
```

**Verification** (`verification/`) sits alongside: CSI/POD/FAR/HSS, FSS,
Brier scores and reliability diagrams for the advection nowcast vs
persistence, on three synthetic Indian case studies. Results: `results.json`
(machine-readable, also served at `GET /api/verification`).

## Quickstart

### Docker (recommended if you have Docker — one command)

```bash
docker compose up --build
```

- Dashboard: **http://localhost:8080**
- API directly: http://localhost:8000 · health: http://localhost:8000/api/health
- Backend data (SQLite `cycles.db`) persists in the `bhoomirakshak-data` volume.

### Local, without Docker (verified working on Windows)

The backend needs **Python 3.9+**. On some Windows Python installs the
bundled `venv`/`ensurepip` is broken (`ensurepip ... exit status 101`) — if
`python -m venv .venv` fails for you, skip the venv and install straight to
your user site-packages instead; both paths are shown below.

```bash
# Backend — Option A: normal venv (try this first)
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt      # Windows
.venv/bin/pip install -r requirements.txt          # macOS/Linux
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Backend — Option B: if venv/ensurepip is broken, install to the base interpreter
cd backend
python -m pip install --user -r requirements.txt
python -m pip install --user eval_type_backport   # needed on Python 3.9 (see Known Issues)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

```bash
# Frontend (new terminal)
cd frontend
npm install
npm run dev
# open the printed URL — usually http://localhost:5173/#/app
```

> If the frontend loads as a blank white page in your normal browser, try
> Incognito / a private window first — a security/antivirus browser
> extension intercepting Vite's dev-server module is a common cause, not a
> code bug (see Known Issues).

### Verification harness (no services needed)

```bash
cd verification && pip install -r requirements.txt
python3 run_case_studies.py --self-test   # sanity checks
python3 run_case_studies.py               # ~2 s; writes results.json,
                                          # VERIFICATION_REPORT.md,
                                          # reliability_diagrams.png
```

## Five-minute judge demo

1. **Start it** — `docker compose up --build`; open http://localhost:8080.
   India fills the map (Bhuvan base-map toggle); the region picker lists the
   8 metros; the clock and countdowns run on IST.
2. **Pick Delhi-NCR.** Hazard polygons appear with IMD colour codes
   (yellow/orange/red). Click one: English + Hindi advisory referencing DDMA,
   lead time, and affected districts (Central Delhi, Gurugram, Noida…).
3. **Scrub the lead-time slider 0 → 360 min.** Polygons advect with the storm
   motion field — this is the optical-flow nowcast, not a static buffer.
   Watch the countdown to the next 5-minute cycle; new polygons push live over
   the WebSocket (no refresh).
4. **Switch region to Chennai, then Mumbai.** Same pipeline, per-metro
   windows, districts and advisories swap.
5. **Ask for the numbers.** `curl localhost:8000/api/verification | python3 -m json.tool`
   serves the verification results; or open `verification/VERIFICATION_REPORT.md`:
   at 60-min lead the nowcast beats persistence decisively —
   **hail CSI 0.57 vs 0.06, squall-line CSI 0.26 vs 0.00** (cloudburst 0.63 vs
   0.63 — an honest tie for quasi-stationary orographic convection, where the
   nowcast correctly degrades to persistence).
6. **Ask what's simulated.** The storm simulator is labeled in the UI and
   docs: real Open-Meteo CAPE/CIN/850 hPa wind drive a synthetic reflectivity
   field standing in for DWR/INSAT/lightning until access is granted. Swap in
   the India-first feeds from the table below with no API change.
7. **Switch to Relocation Planning Mode.** Click **"Relocation Planning →"** in the top navigation bar or from the landing page. The AI-GIS disaster relocation cockpit opens with spatial multi-hazard footprints, vulnerable habitations, and candidate relief camps.
8. **Trigger "RUN ANALYTICS ENGINE".** Click the blue **RUN ANALYTICS ENGINE** button: the backend intersects spatial hazard layers with demographic vulnerability (elderly %, disabled %, Kutcha housing, low income), computing priority scores and allocating residents to safe camps without exceeding carrying capacity.
9. **Explainable AI (XAI) & Statutory Legal Certificate.** Click on an Immediate Phase red zone to view the transparent XAI justification. Click **"Download Legal Certificate (PDF)"**: a dynamically generated, tamper-evident directive is downloaded with a cryptographic SHA-256 blockchain audit hash.

## Dashboard UI

- **Map controls** — standard +/− zoom control (bottom-right of the map), plus pan/scroll zoom.
- **District Alerts panel** — a hamburger (☰) button in the header slides the whole panel open/closed, Google-Maps style, with the map auto-expanding to fill the freed space. Each district card can also be collapsed individually to just its name and severity badge.
- **Theme** — light, rain/storm-blue palette by default; a theme toggle in the header switches between light and dark.
- **3D Storm Engine** — the landing page's rain visualization has a droplet-size control (Normal / Big Drops / Huge Drops) to tune particle size and density.

## Data sources — India first

Access status as checked in the team briefing (Sept 2026): **VERIFIED** =
programmatic access confirmed; **REGISTER** = sign-up/whitelisting required;
**REQUEST** = data-sharing request required. Bhuvan is listed only for base-map
WMS tiles — it is not a meteorological feed.

| Source | Data | Access | Status |
|---|---|---|---|
| pyiwr (IIT Indore) | IMD DWR raw files → NetCDF (`pip install pyiwr`) | Open source | VERIFIED |
| INSAT-3D IMSRA | Half-hourly satellite rainfall, India domain | MOSDAC file download | VERIFIED |
| ISRO Bhuvan | Base maps + district boundaries (dashboard WMS only) | Public WMS | VERIFIED |
| IMD API Portal | Warnings, nowcast bulletins, district alerts | Registration + IP whitelisting | REGISTER |
| MOSDAC (ISRO) | INSAT-3D/3DR IR/WV/VIS, IMSRA rainfall, CTT (4 km) | API + signup | REGISTER |
| NCMRWF NCUM-R | Regional NWP, ~4 km, India domain | Web dashboard / data portal | REGISTER |
| NCMRWF IMDAA | Reanalysis 12 km hourly, 1990–present | Register + download | REGISTER |
| IMD DWR Network | Doppler radar reflectivity/velocity, 37 sites | Raw data via request | REQUEST |
| IITM Pune Lightning Location Network | Real-time strike data | Contact institute for API | REQUEST |

*International datasets and services appear in this project **only** as
pretraining / prototyping substitutes — never as operational feeds. The live
demo uses Open-Meteo convective parameters (no key) to drive the labeled
synthetic storm simulator.*

## Roadmap — the 8 phases

From the SIH26084 team briefing; this build covers the working core, with
verification gating each step:

1. **Data ingestion engine** — done: multi-source ingest per metro window
   (Open-Meteo live; DWR/INSAT/lightning adapters defined, pending access).
2. **Historical training dataset** — pending: IMD DWR archives via pyiwr once
   REQUEST is granted; IMDAA reanalysis (REGISTER) as fallback.
3. **Convective cell tracking** — done: storm-cell objects with lifecycle state
   in the simulator; to be rebuilt on real DWR mosaics.
4. **Baseline nowcast** — done: dense Farneback optical flow, semi-Lagrangian
   advection, 15–360 min leads; verified vs persistence (this repo).
5. **Deep-learning nowcast** — pending: learned advection + intensity
   evolution; the verification harness is built to score it unchanged.
6. **Multi-source fusion** — pending: radar + INSAT-3D + lightning + NWP blending.
7. **Hazard-specific heads** — done: thunderstorm / hail / cloudburst / damaging
   wind heads with IMD colour codes and EN+HI advisories live now.
8. **Real-time GIS dashboard + backend** — done: FastAPI + WebSocket +
   React/Leaflet dashboard, `docker compose up` deployable.

## Verification headline

`verification/run_case_studies.py` — deterministic, ~2 s. Full report in
`verification/VERIFICATION_REPORT.md`.

| Case (synthetic reconstruction) | 60-min CSI nowcast | 60-min CSI persistence |
|---|---|---|
| 2023 Himachal cloudbursts | 0.63 | 0.63 |
| 2024 Delhi-NCR dust-storm / hail | **0.57** | 0.06 |
| Bay-of-Bengal-coast squall line (Chennai) | **0.26** | 0.00 |

The nowcast wins decisively for moving convection; for quasi-stationary
orographic cloudbursts it ties persistence — the correct behaviour, enforced
by a documented weak-motion prior. Scores rank methods on synthetic truth;
they do not certify real-world CSI.

## Known issues / local-setup notes

- **`ensurepip`/venv creation failing on Windows** (`exit status 101`): a
  broken bundled pip wheel in some Python installs, unrelated to this repo.
  Workaround is Option B in Quickstart above (`pip install --user`, no venv).
- **`TypeError: Unable to evaluate type annotation 'str | None'`** on
  startup: Python 3.9 can't natively evaluate PEP 604 union syntax the
  codebase uses. Fix: `pip install eval_type_backport` (already in the
  Quickstart commands above).
- **Blank white page on `localhost:5173`**: usually a browser
  security/antivirus extension corrupting Vite's dev-server module refresh,
  not a code bug — try Incognito/a private window.
- **`pyproj` in `requirements.txt`**: recent pyproj releases have dropped
  Python 3.9 wheels; if install fails on this line, pin an older
  Python-3.9-compatible version.
- Leaflet map containers must call `invalidateSize()` after any CSS-driven
  resize (e.g. a sidebar collapsing) — handled automatically via a
  `ResizeObserver` in `frontend/src/components/StormMap.jsx`.

## Honest caveats

- **The radar/satellite/lightning feeds are simulated.** A deterministic,
  labeled storm simulator stands in for IMD DWR, INSAT-3D and lightning data.
  It is driven by *real* Open-Meteo CAPE/CIN/850 hPa wind — but it is not
  observations. Nothing in the UI or API pretends otherwise.
- **No initiation or decay forecast.** Like all pure-advection nowcasts, the
  system moves existing storms; it cannot birth or kill cells. Long-lead skill
  collapses during rapid evolution — measured and documented, not hidden.
- **Verification is on synthetic reconstructions**, informed by the character
  of real Indian episodes (2023 Himachal cloudbursts, 2024 Delhi-NCR
  dust-storm/hail, Bay-of-Bengal-coast squall line) — not observed-radar
  reanalyses. Re-run against DWR archives once access lands.
- **The harness uses a global motion vector**; the backend uses dense
  per-pixel Farneback flow. Real-world skill for sheared/rotating systems
  should be *higher* than the harness numbers.
- **Data access is the critical path.** DWR raw data and the IITM lightning
  feed both need institutional REQUESTs; the build is designed so they slot in
  with no API change, but the timeline is not in our hands.

## Project structure

```
A.A.R.A.M.B.H/
├── backend/
│   ├── app/               # FastAPI app: ingest scheduler, hazard heads,
│   │                      # relocation engine, API routes, WebSocket
│   ├── data/               # SQLite DB, seed data (gitignored at runtime)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── run_local.ps1       # Windows PowerShell local-run helper
├── frontend/
│   ├── src/
│   │   ├── components/     # StormMap, DistrictPanel, Header, 3D rain scene…
│   │   ├── pages/          # Dashboard, RelocationDashboard, Landing
│   │   ├── styles/         # design tokens, dashboard.css, landing.css
│   │   ├── utils/          # api client, formatting helpers
│   │   └── router.js       # hash-based routing (#/, #/app, #/relocation)
│   └── package.json
├── verification/           # CSI/POD/FAR/HSS scoring harness + reports
├── docker-compose.yml
├── render.yaml              # Render.com backend deploy config
└── ARCHITECTURE.md
```

---
*A.A.R.A.M.B.H — Bharat Convective Nowcasting · SIH 2026 (SIH26084) ·
All timestamps IST (Asia/Kolkata, +05:30).*
