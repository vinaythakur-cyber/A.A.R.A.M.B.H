"""
Real convective parameters from Open-Meteo (no API key required).

Fetches CAPE, CIN (convective inhibition) and precipitation for the domain
centre, plus 850 hPa winds used as the storm steering proxy. Results are
cached on disk; on network failure the fetcher falls back to the cache and,
if no cache exists, to climatological fallbacks so a cycle can always run.
"""
from __future__ import annotations

import json
import logging
import math
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import requests

from ..config import DATA_DIR, get_region, settings

log = logging.getLogger(__name__)

CACHE_DIR = DATA_DIR / "open_meteo"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Climatological fallback (monsoon-ish September Delhi values) when neither
# network nor cache is available.
FALLBACK = {
    "cape_jkg": 1200.0,
    "cin_jkg": 60.0,
    "precip_mm": 0.0,
    "u850_ms": -3.0,   # easterly steering typical in monsoon
    "v850_ms": 1.0,
    "source": "climatology_fallback",
}


@dataclass
class ConvectiveParams:
    cape_jkg: float
    cin_jkg: float
    precip_mm: float
    u850_ms: float
    v850_ms: float
    source: str = "open_meteo"


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _cache_file(region_id: str) -> Path:
    return CACHE_DIR / f"{region_id}.json"


def fetch_params(region_id: str, timeout: int = 12) -> ConvectiveParams:
    """Fetch current convective parameters for a region centre from api.open-meteo.com."""
    region = get_region(region_id)
    assert region is not None
    params = {
        "latitude": region.center_lat,
        "longitude": region.center_lon,
        "current": "cape,convective_inhibition,precipitation",
        "hourly": "wind_speed_850hPa,wind_direction_850hPa",
        "forecast_days": 1,
        "timezone": "auto",
    }
    resp = requests.get(settings.OPEN_METEO_URL, params=params, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()

    cur = data.get("current", {})
    cape = float(cur.get("cape", 0.0) or 0.0)
    cin = abs(float(cur.get("convective_inhibition", 0.0) or 0.0))
    precip = float(cur.get("precipitation", 0.0) or 0.0)

    # 850 hPa wind: find hourly entry closest to "now" and convert to u/v.
    u850, v850 = FALLBACK["u850_ms"], FALLBACK["v850_ms"]
    try:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        speeds = hourly.get("wind_speed_850hPa", [])
        dirs = hourly.get("wind_direction_850hPa", [])
        if times and speeds and dirs:
            now_iso = cur.get("time", times[0])
            # first hourly index at/after current time
            idx = next((i for i, t in enumerate(times) if t >= now_iso), 0)
            wspd = float(speeds[idx] or 0.0) * 1000.0 / 3600.0  # km/h -> m/s
            wdir = float(dirs[idx] or 0.0)
            rad = math.radians(wdir)
            # meteorological dir = where wind comes FROM; flip for vector direction
            u850 = -wspd * math.sin(rad)
            v850 = -wspd * math.cos(rad)
    except Exception as exc:  # keep fallback wind, never fail the cycle
        log.warning("850hPa wind parse failed (%s); using fallback", exc)

    result = ConvectiveParams(
        cape_jkg=_clamp(cape, 0.0, 6000.0),
        cin_jkg=_clamp(cin, 0.0, 1000.0),
        precip_mm=_clamp(precip, 0.0, 300.0),
        u850_ms=u850,
        v850_ms=v850,
        source="open_meteo",
    )
    _save_cache(region_id, result)
    return result


def _save_cache(region_id: str, p: ConvectiveParams) -> None:
    try:
        _cache_file(region_id).write_text(json.dumps({**asdict(p), "fetched_at": time.time()}))
    except OSError as exc:
        log.warning("could not write open-meteo cache: %s", exc)


def load_cache(region_id: str, max_age_s: float | None = None) -> ConvectiveParams | None:
    cache_file = _cache_file(region_id)
    if not cache_file.exists():
        return None
    try:
        blob = json.loads(cache_file.read_text())
        if max_age_s is not None and time.time() - blob.get("fetched_at", 0) > max_age_s:
            return None
        return ConvectiveParams(
            cape_jkg=blob["cape_jkg"], cin_jkg=blob["cin_jkg"],
            precip_mm=blob["precip_mm"], u850_ms=blob["u850_ms"],
            v850_ms=blob["v850_ms"], source="cache",
        )
    except (OSError, KeyError, ValueError, TypeError) as exc:
        log.warning("open-meteo cache unreadable: %s", exc)
        return None


def get_params(region_id: str) -> ConvectiveParams:
    """
    Best-effort params per region: fresh fetch -> disk cache -> climatology fallback.
    Never raises; a cycle can always be produced.
    """
    try:
        return fetch_params(region_id)
    except Exception as exc:
        log.warning("Open-Meteo fetch failed for %s (%s); trying cache", region_id, exc)
    cached = load_cache(region_id)
    if cached is not None:
        return cached
    log.warning("no cache for %s; using climatology fallback params", region_id)
    return ConvectiveParams(**FALLBACK)
