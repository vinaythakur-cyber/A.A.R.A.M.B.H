"""
BhoomiRakshak nowcasting backend — FastAPI service (India-only scope).

Serves the ARCHITECTURE.md API contract:
    GET /api/regions
    GET /api/health, /api/hazards/latest, /api/forecast/{lead_min},
        /api/radar/latest, /api/districts, /api/cycle, /api/verification
        (data endpoints accept ?region=<id>, default delhi-ncr)
    WS  /ws/live  (pushes {"event":"new_cycle","region":...,...} per cycle/region)

On startup the scheduler runs one full cycle per region immediately, so every
endpoint is live without waiting for the 5-min interval. All timestamps are
Asia/Kolkata (IST), ISO8601 with +05:30.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import DEFAULT_REGION, get_region, region_bounds, region_ids, settings
from .ingest import scheduler
from .store import cached_regions, get_cache
from .relocation import database as reloc_db
from .relocation import models as reloc_models
from .relocation import routes as reloc_routes
from .relocation import seed as reloc_seed
from .relocation import engine as reloc_engine

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

VERIFICATION_JSON = Path(__file__).resolve().parents[2] / "verification" / "results.json"

app = FastAPI(title="A.A.R.A.M.B.H API — Atmospheric Analysis & Rapid Alert Monitoring for Bursts & Hazards",
              version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # demo dashboard; tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reloc_routes.router)


@app.on_event("startup")
async def _startup() -> None:
    # 1. Start convective nowcasting scheduler loop
    scheduler.start()

    # 2. Initialize Relocation DB schema & pre-seed
    try:
        reloc_models.Base.metadata.create_all(bind=reloc_db.engine)
        with reloc_db.SessionLocal() as session:
            reloc_seed.seed_if_empty(session)
            reloc_engine.run_analytics_engine(session)
        log.info("Relocation DB initialized and initial analytics cycle computed.")
    except Exception as exc:
        log.exception("Error initializing relocation subsystem: %s", exc)


# ------------------------------------------------------------------ helpers
def _region_or_400(region: str | None) -> str:
    rid = region or DEFAULT_REGION
    if get_region(rid) is None:
        raise HTTPException(
            status_code=400,
            detail=f"unknown region '{rid}'; valid: {', '.join(region_ids())}",
        )
    return rid


def _require_cycle(region_id: str) -> dict:
    snap = get_cache(region_id).snapshot()
    if snap["cycle_id"] == 0:
        raise HTTPException(status_code=503, detail=f"first cycle still running for {region_id}")
    return snap


def _downsample_96(grid: np.ndarray) -> list[list[float]]:
    """120x120 dBZ -> 96x96 via area averaging (numpy only, no cv2 needed here)."""
    try:
        import cv2
        small = cv2.resize(grid.astype(np.float32), (96, 96), interpolation=cv2.INTER_AREA)
    except ImportError:
        idx = (np.linspace(0, grid.shape[0] - 1, 96)).astype(int)
        small = grid[np.ix_(idx, idx)]
    return [[round(float(v), 1) for v in row] for row in small]


# ------------------------------------------------------------------ routes
@app.get("/api/regions")
def regions() -> list[dict]:
    """India-only region presets: id, name, center, districts."""
    return [
        {
            "id": r.id,
            "name": r.name,
            "center": [r.center_lat, r.center_lon],
            "districts": [{"name": d[0], "lat": d[1], "lon": d[2]} for d in r.districts],
        }
        for r in [get_region(rid) for rid in region_ids()]
    ]


@app.get("/api/health")
def health() -> dict:
    snap = get_cache(DEFAULT_REGION).snapshot()
    return {
        "status": "ok",
        "last_cycle": snap["valid_time"],
        "mode": snap["mode"],
        "regions": cached_regions(),
        "default_region": DEFAULT_REGION,
    }


@app.get("/api/hazards/latest")
def hazards_latest(region: str | None = Query(default=None)) -> dict:
    rid = _region_or_400(region)
    snap = _require_cycle(rid)
    return {"type": "FeatureCollection", "features": snap["features_by_lead"].get(0, [])}


@app.get("/api/forecast/{lead_min}")
def forecast(lead_min: int, region: str | None = Query(default=None)) -> dict:
    if lead_min < 0 or lead_min > 360 or lead_min % settings.STEP_MIN != 0:
        raise HTTPException(
            status_code=400,
            detail=f"lead_min must be one of 0,15,...,360 (got {lead_min})",
        )
    rid = _region_or_400(region)
    snap = _require_cycle(rid)
    return {"type": "FeatureCollection", "features": snap["features_by_lead"].get(lead_min, [])}


@app.get("/api/radar/latest")
def radar_latest(region: str | None = Query(default=None)) -> dict:
    rid = _region_or_400(region)
    snap = _require_cycle(rid)
    grid = snap["radar_grid"]
    return {
        "bounds": region_bounds(rid),
        "grid": _downsample_96(grid),
        "resolution_km": round(settings.cell_km, 2),
        "valid_time": snap["valid_time"],
    }


@app.get("/api/districts")
def districts(region: str | None = Query(default=None)) -> list[dict]:
    rid = _region_or_400(region)
    snap = _require_cycle(rid)
    return snap["districts"]


@app.get("/api/cycle")
def cycle(region: str | None = Query(default=None)) -> dict:
    rid = _region_or_400(region)
    snap = _require_cycle(rid)
    next_in = max(0, int(snap["cycle_started_at"] + settings.CYCLE_INTERVAL_S - time.time()))
    return {
        "cycle_id": snap["cycle_id"],
        "valid_time": snap["valid_time"],
        "next_cycle_in_s": next_in,
        "hazard_counts": snap["hazard_counts"],
        "region": rid,
    }


@app.get("/api/verification")
def verification() -> dict:
    if VERIFICATION_JSON.exists():
        return json.loads(VERIFICATION_JSON.read_text())
    return {
        "status": "pending",
        "message": "verification case studies have not been run yet; "
                   "see verification/run_case_studies.py",
    }


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket) -> None:
    await ws.accept()
    q = scheduler.subscribe()
    try:
        # send current state for every live region so the client doesn't wait
        for rid in cached_regions():
            snap = get_cache(rid).snapshot()
            await ws.send_json({
                "event": "new_cycle",
                "region": rid,
                "cycle_id": snap["cycle_id"],
                "valid_time": snap["valid_time"],
                "counts": snap["hazard_counts"],
            })
        while True:
            event = await q.get()
            await ws.send_json(event)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        scheduler.unsubscribe(q)
