"""Hazard head package — each head maps advected reflectivity to a hazard field.

All heads are calibrated heuristics (documented honestly in each module);
thresholds come from ARCHITECTURE.md. Heads return a HazardResult holding the
physical-quantity field plus per-pixel probability and severity grids, which
polygons.py turns into GeoJSON.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class HazardResult:
    name: str                       # lightning | hail | downburst | cloudburst
    field: np.ndarray               # physical quantity (flashes/km2/hr, prob, km/h, mm/h)
    probability: np.ndarray         # 0..1 per pixel
    severity: np.ndarray            # 0 none, 1 yellow, 2 orange, 3 red
    unit_label: str                 # for intensity strings
