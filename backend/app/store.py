"""
Cycle archive (SQLite) + in-memory latest-cycle cache.

Each 5-min cycle persists a compact JSON summary to SQLite
(data/cycles.db); the hot data — latest radar frame, advected forecast
frames, GeoJSON feature lists per lead time, district table — lives in a
thread-safe in-memory cache served by the API. On restart the scheduler
runs one cycle immediately, so endpoints work without waiting.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from .config import DATA_DIR, settings

log = logging.getLogger(__name__)

DB_PATH = DATA_DIR / "cycles.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS cycles (
    cycle_id   INTEGER NOT NULL,
    region     TEXT NOT NULL DEFAULT 'delhi-ncr',
    valid_time TEXT NOT NULL,
    created_at TEXT NOT NULL,
    params     TEXT NOT NULL,   -- ConvectiveParams JSON
    counts     TEXT NOT NULL,   -- hazard counts JSON
    PRIMARY KEY (cycle_id, region)
);
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute(SCHEMA)
    # migrate older DBs that lack the region column
    cols = [r[1] for r in conn.execute("PRAGMA table_info(cycles)").fetchall()]
    if "region" not in cols:
        conn.execute("ALTER TABLE cycles ADD COLUMN region TEXT NOT NULL DEFAULT 'delhi-ncr'")
    conn.commit()
    return conn


class CycleStore:
    """SQLite archive of past cycles, keyed by (region, cycle_id)."""

    def __init__(self) -> None:
        self._conn = _connect()
        self._lock = threading.Lock()

    def record(self, region: str, cycle_id: int, valid_time: str, params: dict, counts: dict) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO cycles (cycle_id, region, valid_time, created_at, params, counts)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (
                    cycle_id, region, valid_time,
                    datetime.now(timezone.utc).isoformat(),
                    json.dumps(params),
                    json.dumps(counts),
                ),
            )
            self._conn.commit()

    def last_cycle_id(self, region: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT MAX(cycle_id) FROM cycles WHERE region = ?", (region,)).fetchone()
        return int(row[0]) if row and row[0] is not None else 0

    def recent(self, region: str, limit: int = 12) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT cycle_id, valid_time, created_at, counts FROM cycles"
                " WHERE region = ? ORDER BY cycle_id DESC LIMIT ?", (region, limit),
            ).fetchall()
        return [
            {
                "cycle_id": r[0], "valid_time": r[1], "created_at": r[2],
                "counts": json.loads(r[3]),
            }
            for r in rows
        ]


class LatestCache:
    """Hot in-memory state served by the API."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.cycle_id: int = 0
        self.valid_time: str | None = None
        self.mode: str = settings.MODE
        self.radar_grid = None            # 120x120 float32 dBZ (latest analysis)
        self.prev_grid = None             # previous frame for optical flow
        self.forecast_frames: list = []   # 24 advected 120x120 frames
        self.features_by_lead: dict[int, list[dict]] = {}
        self.districts: list[dict] = []
        self.hazard_counts: dict[str, int] = {}
        self.params: dict = {}
        self.cycle_started_at: float = 0.0

    def update(self, **kwargs) -> None:
        with self._lock:
            for k, v in kwargs.items():
                setattr(self, k, v)

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "cycle_id": self.cycle_id,
                "valid_time": self.valid_time,
                "mode": self.mode,
                "radar_grid": None if self.radar_grid is None else self.radar_grid.copy(),
                "forecast_frames": [f.copy() for f in self.forecast_frames],
                "features_by_lead": {k: list(v) for k, v in self.features_by_lead.items()},
                "districts": list(self.districts),
                "hazard_counts": dict(self.hazard_counts),
                "params": dict(self.params),
                "cycle_started_at": self.cycle_started_at,
            }


store = CycleStore()
_caches: dict[str, LatestCache] = {}


def get_cache(region_id: str) -> LatestCache:
    """Latest-cycle cache for one region (created on demand)."""
    cache = _caches.get(region_id)
    if cache is None:
        cache = LatestCache()
        _caches[region_id] = cache
    return cache


def cached_regions() -> list[str]:
    return [r for r, c in _caches.items() if c.cycle_id > 0]
