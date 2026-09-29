"""
Asyncio inference scheduler — the heartbeat of the backend.

Every CYCLE_INTERVAL_S (default 5 min), for EACH configured Indian metro
region:
    1. ingest:  fresh convective params from Open-Meteo for the region centre
                (refreshed every 30 min; cached/climatology fallback) +
                region-seeded synthetic storm field step (DEMO stand-in for
                DWR/INSAT).
    2. nowcast: dense Farneback optical flow between last two dBZ frames ->
                semi-Lagrangian advection forward 24 x 15-min steps.
    3. hazards: four heads (lightning, hail, downburst, cloudburst) evaluated
                on each advected frame -> marching-squares polygons with
                English + Hindi advisories (IMD colour-code language).
    4. store:   SQLite archive + per-region in-memory latest cache ->
                WS broadcast.

All timestamps are Asia/Kolkata (IST), ISO8601 with +05:30.
One cycle per region runs immediately on startup so every endpoint is live
without waiting.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import asdict
from datetime import datetime

import numpy as np

from ..config import IST, get_region, now_ist, region_ids, region_pixel, settings
from ..nowcast.extrapolate import extrapolate
from ..nowcast.optical_flow import estimate_flow
from ..hazards import cloudburst, downburst, hail, lightning
from ..hazards.polygons import probability_features, result_to_features
from ..store import get_cache, store
from .open_meteo import ConvectiveParams, get_params
from .storm_sim import StormSimulator

log = logging.getLogger(__name__)

SEV_NAMES = {0: "none", 1: "yellow", 2: "orange", 3: "red"}
SEV_RANK = {"none": 0, "yellow": 1, "orange": 2, "red": 3}

_subscribers: list[asyncio.Queue] = []
_sims: dict[str, StormSimulator] = {}
_last_params: dict[str, ConvectiveParams] = {}
_last_params_fetch: dict[str, float] = {}
_first_cycle: dict[str, bool] = {}
_task: asyncio.Task | None = None


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=64)
    _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    try:
        _subscribers.remove(q)
    except ValueError:
        pass


async def _broadcast(event: dict) -> None:
    dead = []
    for q in _subscribers:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        unsubscribe(q)


def _get_params_cached(region_id: str) -> ConvectiveParams:
    """Refresh Open-Meteo params per region at most every PARAMS_REFRESH_S."""
    now = time.time()
    if region_id not in _last_params or now - _last_params_fetch.get(region_id, 0) > settings.PARAMS_REFRESH_S:
        _last_params[region_id] = get_params(region_id)
        _last_params_fetch[region_id] = now
        p = _last_params[region_id]
        log.info("[%s] convective params: CAPE=%.0f CIN=%.0f (%s)",
                 region_id, p.cape_jkg, p.cin_jkg, p.source)
    return _last_params[region_id]


def _sim_for(region_id: str) -> StormSimulator:
    sim = _sims.get(region_id)
    if sim is None:
        region = get_region(region_id)
        assert region is not None
        sim = StormSimulator(seed=region.seed)
        _sims[region_id] = sim
    return sim


def _district_advisory(hazard: str, severity: str) -> tuple[str, str]:
    en = {
        "lightning": "IMD %s Alert: lightning risk — stay indoors, avoid open areas.",
        "hail": "IMD %s Alert: hail risk — move vehicles under cover, stay away from windows.",
        "downburst": "IMD %s Alert: damaging winds — secure loose objects, avoid weak shelters.",
        "cloudburst": "IMD %s Alert: extreme rain — avoid low-lying areas and underpasses.",
        "none": "No hazardous weather expected in the next 6 hours. Follow IMD bulletins.",
    }[hazard]
    hi = {
        "lightning": "आईएमडी %s अलर्ट: बिजली का खतरा — घर के अंदर रहें, खुले क्षेत्रों से बचें।",
        "hail": "आईएमडी %s अलर्ट: ओलों का खतरा — वाहनों को छत के नीचे रखें, खिड़कियों से दूर रहें।",
        "downburst": "आईएमडी %s अलर्ट: खतरनाक हवाएँ — खुली वस्तुओं को सुरक्षित करें, कमज़ोर शेड से बचें।",
        "cloudburst": "आईएमडी %s अलर्ट: अत्यंत भारी वर्षा — निचले इलाकों और अंडरपास से बचें।",
        "none": "अगले 6 घंटों में कोई खतरनाक मौसम अपेक्षित नहीं। आईएमडी बुलेटिन देखते रहें।",
    }[hazard]
    label_en = {"yellow": "Yellow — Be Aware", "orange": "Orange — Be Prepared",
                "red": "Red — Take Action"}.get(severity, "")
    label_hi = {"yellow": "येलो — सचेत रहें", "orange": "ऑरेंज — तैयार रहें",
                "red": "रेड — तुरंत कार्रवाई करें"}.get(severity, "")
    if hazard == "none":
        return en, hi
    extra = " Follow DDMA / district administration instructions." if severity in ("orange", "red") else ""
    extra_hi = " DDMA / जिला प्रशासन के निर्देशों का पालन करें।" if severity in ("orange", "red") else ""
    return (en % label_en) + extra, (hi % label_hi) + extra_hi


def _build_districts(region_id: str, hazard_results_by_lead: list[list]) -> list[dict]:
    """Earliest-arriving hazard per district from the per-lead hazard results."""
    region = get_region(region_id)
    assert region is not None
    rows = []
    for name, lat, lon in region.districts:
        r, c = region_pixel(region_id, lat, lon)
        adv_en, adv_hi = _district_advisory("none", "none")
        best = {"district": name, "hazard": "none", "severity": "none",
                "arrival_minutes": -1, "probability": 0.0,
                "advisory": adv_en, "advisory_hi": adv_hi}
        for k, results in enumerate(hazard_results_by_lead):
            lead = k * settings.STEP_MIN
            for res in results:
                sev = int(res.severity[r, c])
                if sev > SEV_RANK[best["severity"]]:
                    adv_en, adv_hi = _district_advisory(res.name, SEV_NAMES[sev])
                    best = {
                        "district": name,
                        "hazard": res.name,
                        "severity": SEV_NAMES[sev],
                        "arrival_minutes": lead,
                        "probability": round(float(res.probability[r, c]), 3),
                        "advisory": adv_en,
                        "advisory_hi": adv_hi,
                    }
                if best["severity"] == "red":
                    break
            if best["severity"] == "red":
                break
        rows.append(best)
    return rows


def run_cycle(region_id: str) -> dict:
    """Execute one full ingest->nowcast->hazards->store cycle for a region."""
    t0 = time.time()
    cache = get_cache(region_id)
    params = _get_params_cached(region_id)
    sim = _sim_for(region_id)

    # 1. ingest: synthetic storm field step (DEMO stand-in for DWR/INSAT)
    if _first_cycle.get(region_id, True):
        # warm-up: evolve 60 min of virtual storm time so the first served
        # cycle already contains mature cells (and non-zero flow)
        for _ in range(12):
            sim.step(params, dt_min=5.0)
        _first_cycle[region_id] = False
    grid, cells = sim.step(params, dt_min=settings.CYCLE_INTERVAL_S / 60.0)

    prev = cache.snapshot()["radar_grid"]
    if prev is None:
        prev = grid.copy()  # first cycle: zero motion

    # 2. nowcast: optical flow + semi-Lagrangian advection
    u, v = estimate_flow(prev, grid)
    frames = extrapolate(grid, u, v, settings.n_steps)  # 24 frames

    # 3. hazards on every lead step (timestamps in IST)
    features_by_lead: dict[int, list[dict]] = {}
    hazard_results_by_lead: list[list] = []
    base_ts = now_ist().timestamp()
    for k in range(settings.n_steps + 1):
        f = grid if k == 0 else frames[k - 1]
        lead = k * settings.STEP_MIN
        valid_iso = datetime.fromtimestamp(base_ts + lead * 60, tz=IST).isoformat()
        results = [
            lightning.run(f, params),
            hail.run(f, params),
            downburst.run(f, u, v, settings.cell_km),
        ]
        # cloudburst uses a 60-min window of frames starting at this lead
        win = frames[k: k + 4] if k < len(frames) else [f]
        cb = cloudburst.run(win if len(win) == 4 else (win + [win[-1]] * (4 - len(win))))
        results.append(cb)

        feats: list[dict] = []
        cell_prefix = f"C-{k:03d}-" if k == 0 else ""
        for res in results:
            if res.name == "cloudburst":
                feats.extend(probability_features(res, lead, valid_iso, region_id))
            else:
                feats.extend(result_to_features(res, lead, valid_iso, region_id,
                                                cell_id_prefix=cell_prefix))
        features_by_lead[lead] = feats
        hazard_results_by_lead.append(results)

    districts = _build_districts(region_id, hazard_results_by_lead)
    counts = {
        res.name: sum(1 for feats in features_by_lead.values() for ft in feats
                      if ft["properties"]["hazard"] == res.name)
        for res in hazard_results_by_lead[0]
    }

    cycle_id = store.last_cycle_id(region_id) + 1
    valid_time = now_ist().isoformat()
    cache.update(
        cycle_id=cycle_id, valid_time=valid_time, mode=settings.MODE,
        radar_grid=grid.copy(), prev_grid=prev.copy(),
        forecast_frames=[f.copy() for f in frames],
        features_by_lead=features_by_lead, districts=districts,
        hazard_counts=counts, params=asdict(params),
        cycle_started_at=time.time(),
    )
    store.record(region_id, cycle_id, valid_time, asdict(params), counts)
    log.info("[%s] cycle %d done in %.1fs: %s", region_id, cycle_id, time.time() - t0, counts)
    return {"region": region_id, "cycle_id": cycle_id, "valid_time": valid_time, "counts": counts}


async def _run_region(rid: str) -> None:
    try:
        info = await asyncio.to_thread(run_cycle, rid)
    except Exception:
        log.exception("[%s] cycle failed", rid)
        return
    await _broadcast({"event": "new_cycle", "region": rid,
                      "cycle_id": info["cycle_id"],
                      "valid_time": info["valid_time"],
                      "counts": info["counts"]})


async def _loop() -> None:
    # immediate first cycle per region on startup (concurrent: numpy releases the GIL)
    await asyncio.gather(*(_run_region(rid) for rid in region_ids()))
    while True:
        await asyncio.sleep(settings.CYCLE_INTERVAL_S)
        await asyncio.gather(*(_run_region(rid) for rid in region_ids()))


def start() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())
        log.info("scheduler started (%d regions, interval %ds)",
                 len(region_ids()), settings.CYCLE_INTERVAL_S)
