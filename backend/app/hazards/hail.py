"""
Hail hazard head.

Physics (calibrated heuristic, per ARCHITECTURE.md):
    P(hail) = logistic(0.25 * (Zmax - 55) + 0.002 * CAPE - 1.2)

Rationale: large hail needs intense reflectivity cores (Z > 55 dBZ is the
classic hail-core indicator) embedded in a high-CAPE environment that can
suspend hailstones. The logistic maps the linear predictor to a probability.

Sanity: Z=55, CAPE=1500 -> logit=-1.2+3.0=1.8 -> p=0.86? That looks high.
Recompute: 0.25*(55-55)=0; 0.002*1500=3.0; 3.0-1.2=1.8 -> p=0.858.
So a 55 dBZ core in 1500 J/kg gives high hail prob — aggressive, but the
severity cutoffs (>0.35 yellow, >0.6 orange, >0.8 red) then gate the warnings.
With Z=50, CAPE=800: -1.25+1.6-1.2=-0.85 -> p=0.30 (below yellow). Sensible.
"""
from __future__ import annotations

import numpy as np

from ..ingest.open_meteo import ConvectiveParams
from . import HazardResult

SEV = [(0.35, 1), (0.60, 2), (0.80, 3)]


def run(dbz: np.ndarray, params: ConvectiveParams) -> HazardResult:
    logit = 0.25 * (np.asarray(dbz, dtype=float) - 55.0) + 0.002 * params.cape_jkg - 1.2
    prob = 1.0 / (1.0 + np.exp(-logit))
    severity = np.zeros(dbz.shape, dtype=np.int8)
    for thresh, sev in SEV:
        severity = np.where(prob >= thresh, sev, severity)
    # field is the probability itself, expressed as a fraction 0..1
    return HazardResult(
        name="hail",
        field=prob.astype(np.float32),
        probability=prob.astype(np.float32),
        severity=severity,
        unit_label="hail prob",
    )
