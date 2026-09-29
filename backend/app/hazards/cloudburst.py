"""
Cloudburst hazard head.

Physics (per ARCHITECTURE.md):
    Rain rate from reflectivity via Marshall-Palmer: Z = 200 * R^1.6
        -> R (mm/h) = (10^(dBZ/10) / 200)^(1/1.6)

A cloudburst warning is issued when R >= 100 mm/h is *sustained* over a
60-min window. We use the 4 advected 15-min frames in the window:
    p = fraction of window steps with R >= 100 mm/h (per pixel)
    intensity = peak R in the window
Severity: p > 0.6 -> red, 0.35 <= p <= 0.6 -> orange (per contract).
"""
from __future__ import annotations

import numpy as np

from . import HazardResult

RAIN_THRESH = 100.0  # mm/h
RED_P = 0.6
ORANGE_P = 0.35


def dbz_to_rain(dbz: np.ndarray) -> np.ndarray:
    """Marshall-Palmer Z-R: Z=200 R^1.6 -> R in mm/h."""
    z_lin = 10.0 ** (np.asarray(dbz, dtype=float) / 10.0)  # mm^6/m^3
    return (z_lin / 200.0) ** (1.0 / 1.6)


def run(frames_60min: list[np.ndarray]) -> HazardResult:
    rains = [dbz_to_rain(f) for f in frames_60min]
    stack = np.stack(rains, axis=0)  # (T, H, W)
    exceed = (stack >= RAIN_THRESH).astype(float)
    p = exceed.mean(axis=0)                    # sustained-rain probability
    peak = stack.max(axis=0)                   # peak rain rate in window

    severity = np.zeros(p.shape, dtype=np.int8)
    severity = np.where(p >= ORANGE_P, 2, severity)
    severity = np.where(p > RED_P, 3, severity)

    ref = frames_60min[len(frames_60min) // 2]
    return HazardResult(
        name="cloudburst",
        field=np.clip(peak, 0, 400).astype(np.float32),
        probability=np.clip(p, 0.0, 1.0).astype(np.float32),
        severity=severity,
        unit_label="mm/h",
    )
