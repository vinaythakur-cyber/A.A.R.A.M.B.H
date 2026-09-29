"""Dense Farneback optical flow on reflectivity grids.

Estimates the per-pixel motion vector field (u, v) in cells/frame between two
consecutive 120x120 dBZ frames. The flow field is the motion input to the
semi-Lagrangian extrapolation in extrapolate.py.

Physics note: this is a pure pixel-advection method — it tracks the apparent
motion of echo patterns and assumes motion persists over the forecast horizon
(the "Lagrangian persistence" assumption standard in radar nowcasting). It
cannot predict initiation or decay; that is a documented
limitation of the Stage-1 baseline (DGMR-style deep nowcast is future work).
"""
from __future__ import annotations

import numpy as np

try:
    import cv2
except ImportError:  # pragma: no cover - cv2 is a pinned dependency
    cv2 = None


def _normalise(dbz: np.ndarray) -> np.ndarray:
    """Map 0..75 dBZ to 0..255 uint8, emphasising the convective range."""
    x = np.clip(dbz, 0.0, 75.0)
    return (x / 75.0 * 255.0).astype(np.uint8)


def estimate_flow(prev_dbz: np.ndarray, curr_dbz: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Farneback dense optical flow. Returns (u, v) each of shape (H, W),
    units = grid cells per frame interval.
    """
    if cv2 is None:
        raise RuntimeError("opencv (cv2) is required for optical flow")
    prev = _normalise(np.asarray(prev_dbz, dtype=np.float32))
    curr = _normalise(np.asarray(curr_dbz, dtype=np.float32))
    flow = cv2.calcOpticalFlowFarneback(
        prev, curr, None,
        pyr_scale=0.5, levels=4, winsize=21, iterations=3,
        poly_n=7, poly_sigma=1.2, flags=0,
    )
    u = flow[..., 0].astype(np.float32)  # +x (east)
    v = flow[..., 1].astype(np.float32)  # +y (south in image coords)
    # kill speckle flow in clear air: only trust motion where there is echo
    mask = np.maximum(prev_dbz, curr_dbz) > 18.0
    u = np.where(mask, u, 0.0)
    v = np.where(mask, v, 0.0)
    return u, v


def flow_speed_kmh(u: np.ndarray, v: np.ndarray, cell_km: float, dt_min: float) -> np.ndarray:
    """Convert a flow field to storm-motion speed (km/h)."""
    return np.hypot(u, v) * cell_km / (dt_min / 60.0)
