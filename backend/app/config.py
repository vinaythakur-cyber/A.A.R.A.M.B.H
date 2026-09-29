"""
Central settings for the BhoomiRakshak nowcasting backend.

India-only scope: 8 metro nowcast windows, each 1.2° x 1.2° @ 120x120 cells
(~1 km/cell). All timestamps are Asia/Kolkata (IST), ISO8601 with +05:30.
All values are env-overridable for deployments.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
DATA_DIR = Path(os.getenv("BH_DATA_DIR", BACKEND_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

IST = ZoneInfo("Asia/Kolkata")


def now_ist() -> datetime:
    return datetime.now(IST)


def _f(key: str, default: float) -> float:
    try:
        return float(os.getenv(key, str(default)))
    except ValueError:
        return default


def _i(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, str(default)))
    except ValueError:
        return default


class Settings:
    # --- grid domain -----------------------------------------------------
    CENTER_LAT: float = _f("BH_CENTER_LAT", 28.61)
    CENTER_LON: float = _f("BH_CENTER_LON", 77.23)
    GRID_SPAN_DEG: float = _f("BH_GRID_SPAN_DEG", 1.2)   # 1.2° x 1.2°
    GRID_N: int = _i("BH_GRID_N", 120)                    # 120 x 120 cells

    # --- cycle timing ----------------------------------------------------
    CYCLE_INTERVAL_S: int = _i("BH_CYCLE_INTERVAL_S", 300)  # ingest+inference every 5 min
    PARAMS_REFRESH_S: int = _i("BH_PARAMS_REFRESH_S", 1800)  # Open-Meteo refresh every 30 min

    # --- nowcast ----------------------------------------------------------
    HORIZON_H: int = _i("BH_HORIZON_H", 6)
    STEP_MIN: int = _i("BH_STEP_MIN", 15)
    RADAR_GRID_N: int = 96  # /api/radar/latest serves a 96x96 downsample

    # --- modes ------------------------------------------------------------
    MODE: str = os.getenv("BH_MODE", "live")  # live | demo

    # --- external ---------------------------------------------------------
    OPEN_METEO_URL: str = os.getenv(
        "BH_OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast"
    )

    @property
    def n_steps(self) -> int:
        return (self.HORIZON_H * 60) // self.STEP_MIN  # 24

    @property
    def lat_min(self) -> float:
        return self.CENTER_LAT - self.GRID_SPAN_DEG / 2

    @property
    def lat_max(self) -> float:
        return self.CENTER_LAT + self.GRID_SPAN_DEG / 2

    @property
    def lon_min(self) -> float:
        return self.CENTER_LON - self.GRID_SPAN_DEG / 2

    @property
    def lon_max(self) -> float:
        return self.CENTER_LON + self.GRID_SPAN_DEG / 2

    @property
    def cell_km(self) -> float:
        # ~111 km/deg lat; at Delhi latitude cos-correct lon for km display
        return self.GRID_SPAN_DEG * 111.0 / self.GRID_N

    @property
    def bounds(self) -> list[list[float]]:
        return [[self.lat_min, self.lon_min], [self.lat_max, self.lon_max]]

    def cell_to_latlon(self, row: int, col: int) -> tuple[float, float]:
        """Grid indices (row 0 = south) -> (lat, lon) for the default region."""
        return region_cell_to_latlon(DEFAULT_REGION, row, col)


# ---------------------------------------------------------------------------
# India-only region presets (binding per ARCHITECTURE.md INDIA-ONLY SCOPE).
# Each region: 1.2° x 1.2° window @ 120x120, 6-8 real Indian districts.
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Region:
    id: str
    name: str
    center_lat: float
    center_lon: float
    seed: int
    districts: tuple[tuple[str, float, float], ...]  # (name, lat, lon)


REGIONS: tuple[Region, ...] = (
    Region("delhi-ncr", "Delhi-NCR", 28.61, 77.23, 26084, (
        ("Central Delhi", 28.61, 77.23), ("South Delhi", 28.52, 77.20),
        ("Gurugram", 28.46, 77.03), ("Faridabad", 28.41, 77.31),
        ("Noida", 28.54, 77.39), ("Ghaziabad", 28.67, 77.45),
        ("Sonipat", 28.99, 77.02), ("Meerut", 28.98, 77.71),
    )),
    Region("mumbai", "Mumbai", 19.08, 72.88, 33903, (
        ("Mumbai City", 18.94, 72.83), ("Mumbai Suburban", 19.11, 72.91),
        ("Thane", 19.19, 72.97), ("Navi Mumbai", 19.03, 73.02),
        ("Kalyan", 19.24, 73.13), ("Vasai", 19.39, 72.82),
        ("Raigad", 18.64, 72.88),
    )),
    Region("chennai", "Chennai", 13.08, 80.27, 41722, (
        ("Chennai Central", 13.08, 80.27), ("Adyar", 13.00, 80.25),
        ("Ambattur", 13.11, 80.16), ("Tambaram", 12.92, 80.12),
        ("Tiruvallur", 13.14, 79.91), ("Chengalpattu", 12.68, 79.98),
        ("Sriperumbudur", 12.97, 79.94),
    )),
    Region("kolkata", "Kolkata", 22.57, 88.36, 49541, (
        ("Kolkata", 22.57, 88.36), ("Howrah", 22.59, 88.31),
        ("Salt Lake", 22.57, 88.42), ("Barrackpore", 22.77, 88.37),
        ("Alipore", 22.52, 88.33), ("Baruipur", 22.36, 88.43),
        ("Diamond Harbour", 22.19, 88.19),
    )),
    Region("bengaluru", "Bengaluru", 12.97, 77.59, 57360, (
        ("Bengaluru Central", 12.97, 77.59), ("Whitefield", 12.97, 77.75),
        ("Peenya", 13.03, 77.52), ("Electronic City", 12.85, 77.68),
        ("Yelahanka", 13.10, 77.60), ("Tumakuru", 13.34, 77.10),
        ("Hosur", 12.74, 77.83),
    )),
    Region("hyderabad", "Hyderabad", 17.38, 78.48, 65179, (
        ("Hyderabad", 17.38, 78.48), ("Secunderabad", 17.44, 78.50),
        ("Kukatpally", 17.49, 78.41), ("LB Nagar", 17.34, 78.55),
        ("Medchal", 17.63, 78.48), ("Shamshabad", 17.26, 78.30),
        ("Sangareddy", 17.62, 78.08),
    )),
    Region("ahmedabad", "Ahmedabad", 23.03, 72.58, 72998, (
        ("Ahmedabad", 23.03, 72.58), ("Gandhinagar", 23.22, 72.65),
        ("Naroda", 23.08, 72.66), ("Vatva", 22.95, 72.62),
        ("Sanand", 22.99, 72.38), ("Kalol", 23.24, 72.49),
        ("Nadiad", 22.69, 72.86),
    )),
    Region("lucknow", "Lucknow", 26.85, 80.95, 80817, (
        ("Lucknow", 26.85, 80.95), ("Gomti Nagar", 26.85, 81.00),
        ("Aliganj", 26.91, 80.94), ("Barabanki", 26.93, 81.20),
        ("Unnao", 26.68, 80.48), ("Kanpur", 26.45, 80.33),
    )),
)

DEFAULT_REGION = os.getenv("BH_DEFAULT_REGION", "delhi-ncr")

_REGION_MAP = {r.id: r for r in REGIONS}


def get_region(region_id: str) -> Region | None:
    return _REGION_MAP.get(region_id)


def region_ids() -> list[str]:
    return [r.id for r in REGIONS]


def region_bounds(region_id: str) -> list[list[float]]:
    r = get_region(region_id)
    assert r is not None
    span = settings.GRID_SPAN_DEG
    return [[r.center_lat - span / 2, r.center_lon - span / 2],
            [r.center_lat + span / 2, r.center_lon + span / 2]]


def region_cell_to_latlon(region_id: str, row: int, col: int) -> tuple[float, float]:
    r = get_region(region_id)
    assert r is not None
    span = settings.GRID_SPAN_DEG
    n = settings.GRID_N
    lat = r.center_lat - span / 2 + (row + 0.5) / n * span
    lon = r.center_lon - span / 2 + (col + 0.5) / n * span
    return lat, lon


def region_pixel(region_id: str, lat: float, lon: float) -> tuple[int, int]:
    """(lat, lon) -> (row, col) grid pixel, clipped to the region window."""
    import numpy as np
    r = get_region(region_id)
    assert r is not None
    span = settings.GRID_SPAN_DEG
    n = settings.GRID_N
    row = int(np.clip((lat - (r.center_lat - span / 2)) / span * n, 0, n - 1))
    col = int(np.clip((lon - (r.center_lon - span / 2)) / span * n, 0, n - 1))
    return row, col


settings = Settings()
