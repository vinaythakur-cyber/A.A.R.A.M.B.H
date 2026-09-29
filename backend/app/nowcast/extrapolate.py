"""
Semi-Lagrangian advection of reflectivity forward in time.

Given the current dBZ grid and the dense optical-flow field (u, v) in
cells/frame, the field is extrapolated forward N steps by backward
trajectory integration: each target grid point at step k samples the
field at the position it came from k steps earlier, following the flow.

Advection equation solved (per pixel, backward in time):
    Z(x, t+dt) = Z(x - U*dt, t)
with U interpolated bilinearly (OpenCV remap). The flow is held constant
through the horizon (Lagrangian persistence); intensity is damped slightly
with lead time (factor 0.985^step) to represent the loss of skill with
horizon — a crude but honest stand-in for growth/decay modelling.

Also returns a "max over window" composite useful for hazard heads that
integrate over the 60-min cloudburst window.
"""
from __future__ import annotations

import numpy as np

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None

# per-step intensity decay: after 24 steps ~ 0.985^24 ≈ 0.70
INTENSITY_DECAY = 0.985


def extrapolate(
    dbz: np.ndarray,
    u: np.ndarray,
    v: np.ndarray,
    n_steps: int,
) -> list[np.ndarray]:
    """
    Advect the reflectivity grid forward.

    Returns a list of n_steps grids, index 0 = +1 step (15 min), etc.
    Each grid is float32 dBZ, same shape as input.
    """
    if cv2 is None:
        raise RuntimeError("opencv (cv2) is required for extrapolation")
    h, w = dbz.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    frames: list[np.ndarray] = []
    field = np.asarray(dbz, dtype=np.float32)
    for k in range(1, n_steps + 1):
        # backward trajectory: where does the air at (xx,yy) come from?
        # x_src = xx - u*k ; y_src = yy - v*k  (image coords: +y = south)
        map_x = (xx - u * k).astype(np.float32)
        map_y = (yy - v * k).astype(np.float32)
        adv = cv2.remap(field, map_x, map_y, interpolation=cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_CONSTANT, borderValue=8.0)
        adv = adv * (INTENSITY_DECAY ** k)
        frames.append(np.clip(adv, 0, 75).astype(np.float32))
    return frames


def window_max(frames: list[np.ndarray], steps_per_hour: int = 4) -> np.ndarray:
    """Per-pixel maximum dBZ over the first 60-min window (4 x 15-min steps)."""
    k = min(steps_per_hour, len(frames))
    return np.maximum.reduce(frames[:k]) if k else frames[0]
