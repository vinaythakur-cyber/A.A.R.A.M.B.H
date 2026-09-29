"""
Lightning hazard head.

Physics (calibrated heuristic, per ARCHITECTURE.md):
    density (flashes/km^2/hr) = a * exp(b * Zmax) * sigmoid(CAPE/1500) * (1 + CIN_factor)

Rationale: lightning flash rate scales roughly exponentially with radar
reflectivity (updraft vigour -> charge separation); CAPE gates the overall
convective energy; CIN (capping inversion) suppresses initiation, so
CIN_factor <= 0.

Calibration: a=0.08, b=0.12 chosen so that at CAPE=1500 J/kg, CIN=0:
  Z=55 dBZ -> ~43 flashes (yellow), Z=60 -> ~78 (orange boundary),
  Z=65 -> ~143 (red boundary), Z=70 -> ~260 (deep red).
Severity thresholds: >30 yellow, >80 orange, >150 red.
"""
from __future__ import annotations

import numpy as np

from ..ingest.open_meteo import ConvectiveParams
from . import HazardResult

A = 0.08
B = 0.12
SEV = [(30.0, 1), (80.0, 2), (150.0, 3)]  # (min flashes, severity)


def _sigmoid(x: np.ndarray | float) -> np.ndarray | float:
    return 1.0 / (1.0 + np.exp(-np.asarray(x, dtype=float)))


def run(dbz: np.ndarray, params: ConvectiveParams) -> HazardResult:
    cape_factor = _sigmoid(params.cape_jkg / 1500.0)
    # CIN suppresses updrafts: up to -25% at CIN >= 300 J/kg
    cin_factor = -0.25 * min(params.cin_jkg / 300.0, 1.0)
    density = A * np.exp(B * np.asarray(dbz, dtype=float)) * cape_factor * (1.0 + cin_factor)
    density = np.clip(density, 0, 500)

    severity = np.zeros(dbz.shape, dtype=np.int8)
    for thresh, sev in SEV:
        severity = np.where(density >= thresh, sev, severity)
    probability = np.clip(density / 200.0, 0.0, 0.95).astype(np.float32)
    return HazardResult(
        name="lightning",
        field=density.astype(np.float32),
        probability=probability,
        severity=severity,
        unit_label="flashes/km²/hr",
    )
