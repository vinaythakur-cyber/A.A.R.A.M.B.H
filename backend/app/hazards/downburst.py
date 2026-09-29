"""
Downburst / damaging-wind hazard head.

Physics (calibrated heuristic, per ARCHITECTURE.md):
    gust (km/h) = BASE + c1 * |grad(dBZ)| + c2 * div_proxy

* |grad(dBZ)| — horizontal reflectivity gradient in dBZ/km. Sharp echo
  gradients mark gust fronts / bow echoes, the classic downburst signature.
* div_proxy — velocity divergence of the optical-flow field (per minute),
  computed from the u/v flow components. Strong low-level divergence under a
  storm core indicates a spreading outflow / microburst.

Calibration (heuristic): BASE=20 km/h (ambient monsoon gustiness),
c1=8.0 km/h per dBZ/km (a 6 dBZ/km gradient -> ~48 km/h contribution),
c2=1200 km/h per (1/min) divergence (a strong 0.03/min divergence ->
~36 km/h). Combined with strong cores this reaches >110 km/h for severe
downbursts. Documented as heuristic: true downburst diagnosis needs
radial-velocity data (e.g. DWR), which is future work.
Severity: >70 yellow, >90 orange, >110 red.
"""
from __future__ import annotations

import numpy as np

from . import HazardResult

BASE = 20.0
C1 = 8.0     # km/h per dBZ/km
C2 = 1200.0  # km/h per (1/min) divergence
SEV = [(70.0, 1), (90.0, 2), (110.0, 3)]


def divergence(u: np.ndarray, v: np.ndarray, cell_km: float) -> np.ndarray:
    """
    Velocity divergence of the flow field, per minute.
    u/v are in cells/frame; convert to km/min before differentiating.
    """
    scale = cell_km / 5.0  # cells per 5-min frame -> km/min
    uu = np.asarray(u, dtype=float) * scale
    vv = np.asarray(v, dtype=float) * scale
    dudx = np.gradient(uu, cell_km, axis=1)
    dvdy = np.gradient(vv, cell_km, axis=0)
    return dudx + dvdy  # per minute


def run(dbz: np.ndarray, u: np.ndarray, v: np.ndarray, cell_km: float) -> HazardResult:
    g = np.asarray(dbz, dtype=float)
    grad_mag = np.hypot(*np.gradient(g, cell_km))  # dBZ per km
    div = divergence(u, v, cell_km)
    # only divergent (outflow) motion contributes; convergent inflow is clipped
    gust = BASE + C1 * grad_mag + C2 * np.clip(div, 0, None)
    gust = np.clip(gust, 0, 160)

    severity = np.zeros(dbz.shape, dtype=np.int8)
    for thresh, sev in SEV:
        severity = np.where(gust >= thresh, sev, severity)
    probability = np.clip(gust / 140.0, 0.0, 0.95).astype(np.float32)
    return HazardResult(
        name="downburst",
        field=gust.astype(np.float32),
        probability=probability,
        severity=severity,
        unit_label="km/h gusts",
    )
