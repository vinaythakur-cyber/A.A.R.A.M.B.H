"""
DEMO STAND-IN for DWR/INSAT/lightning feeds.

Deterministic synthetic storm lifecycle simulator on the 120x120 domain grid.
Cell initiation/spawn rates are driven by REAL convective parameters from
Open-Meteo: high CAPE -> more frequent, stronger cells; high CIN -> suppressed
initiation. Cells evolve through initiation -> mature -> dissipate phases and
are steered by the 850 hPa wind (Open-Meteo) with a seeded RNG for full
reproducibility of a demo session.

In production this module is replaced by real radar/lightning/satellite
grids; the interface (reflectivity grid + cell state list) is kept identical.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

import numpy as np

from ..config import settings
from .open_meteo import ConvectiveParams

log = logging.getLogger(__name__)

# ---- tuning (calibrated heuristics, documented honestly) -------------------
# CAPE -> storm environment mapping
CAPE_QUIET = 500.0    # below this: isolated weak cells at most
CAPE_ACTIVE = 1500.0  # above this: organised convection, strong cells
# storm cell geometry
CELL_SIGMA_KM = (4.0, 9.0)     # gaussian core radius range (km)
CELL_MAX_Z = (38.0, 62.0)      # peak dBZ range, CAPE-scaled
LIFETIME_MIN = (30.0, 75.0)    # full lifecycle length
BG_DZ = 8.0                    # background dBZ (clear air / anvil)
NOISE_DZ = 3.0                 # texture noise


@dataclass
class StormCell:
    cell_id: str
    row: float            # centroid, grid coords
    col: float
    max_z: float          # peak reflectivity dBZ
    sigma_km: float       # gaussian radius km
    age_min: float = 0.0
    lifetime_min: float = 60.0
    u_km_min: float = 0.0  # motion vector (steering wind + noise)
    v_km_min: float = 0.0

    @property
    def phase(self) -> str:
        frac = self.age_min / max(self.lifetime_min, 1e-6)
        if frac < 0.25:
            return "initiation"
        if frac < 0.65:
            return "mature"
        return "dissipate"

    @property
    def intensity(self) -> float:
        """Lifecycle envelope: ramps up, plateaus, decays (0..1)."""
        frac = self.age_min / max(self.lifetime_min, 1e-6)
        if frac < 0.25:
            return frac / 0.25
        if frac < 0.65:
            return 1.0
        return max(0.0, 1.0 - (frac - 0.65) / 0.35)

    @property
    def motion(self) -> tuple[float, float]:
        return self.u_km_min, self.v_km_min


@dataclass
class StormState:
    """Persistent simulator state between cycles (kept by the scheduler)."""
    cells: list[StormCell] = field(default_factory=list)
    seed: int = 26084
    next_id: int = 1
    elapsed_min: float = 0.0
    rng: np.random.Generator = field(init=False)

    def __post_init__(self) -> None:
        self.rng = np.random.default_rng(self.seed)


class StormSimulator:
    """
    Steps the storm field forward in time. Physics kept deliberately simple
    and readable:

    * initiation: new cells spawn where CAPE is high and CIN low. Spawn count
      per 5-min cycle ~ Poisson(CAPE/1200); spawn locations biased to the
      windward half of the domain and to the diurnal heating axis.
    * growth: gaussian cores with dBZ peak scaled by CAPE and lifecycle phase.
    * steering: 850 hPa wind converted to km/min, ~80% coupling (storms move
      slightly slower than the environmental wind), plus small random jitter.
    * decay: gaussian envelope past maturity; dead cells are removed.
    """

    def __init__(self, seed: int = 26084) -> None:
        self.state = StormState(seed=seed)

    # ------------------------------------------------------------------ API
    def step(self, params: ConvectiveParams, dt_min: float = 5.0) -> tuple[np.ndarray, list[StormCell]]:
        """Advance the storm field by dt_min; return (dBZ grid 120x120, live cells)."""
        st = self.state
        st.elapsed_min += dt_min
        self._spawn(st, params, dt_min)
        self._advect_and_age(st, params, dt_min)
        grid = self._render(st)
        return grid, [c for c in st.cells if c.intensity > 0.02]

    # ------------------------------------------------------------ internals
    def _spawn(self, st: StormState, p: ConvectiveParams, dt_min: float) -> None:
        # CAPE->cell count: ~0 at <500 J/kg, saturating to ~6 cells/cycle at 3000+.
        rate = 6.0 * _sigmoid((p.cape_jkg - 700.0) / 700.0)
        # CIN caps new development (capping inversion).
        rate *= _sigmoid((400.0 - p.cin_jkg) / 150.0)
        n_new = st.rng.poisson(max(rate * dt_min / 5.0, 0.0))
        n_new = int(min(n_new, 5))  # keep demo domain readable

        for _ in range(n_new):
            # bias spawn location upwind so cells traverse the domain
            u, v = self._steering(p)
            cx, cy = st.rng.uniform(0.15, 0.85), st.rng.uniform(0.15, 0.85)
            if abs(u) + abs(v) > 0.5:  # spawn preferentially upwind
                cx -= 0.25 * u / max(abs(u) + abs(v), 1e-6)
                cy -= 0.25 * v / max(abs(u) + abs(v), 1e-6)
            cx = float(np.clip(cx, 0.05, 0.95))
            cy = float(np.clip(cy, 0.05, 0.95))

            cape_frac = _sigmoid((p.cape_jkg - CAPE_QUIET) / (CAPE_ACTIVE - CAPE_QUIET))
            max_z = float(st.rng.uniform(*CELL_MAX_Z) * (0.75 + 0.45 * cape_frac))
            sigma = float(st.rng.uniform(*CELL_SIGMA_KM))
            lifetime = float(st.rng.uniform(*LIFETIME_MIN) * (0.8 + 0.5 * cape_frac))
            ju = st.rng.normal(0, 0.8)  # km/min jitter
            jv = st.rng.normal(0, 0.8)
            st.cells.append(
                StormCell(
                    cell_id=f"C-{st.next_id:03d}",
                    row=cy * settings.GRID_N,
                    col=cx * settings.GRID_N,
                    max_z=max_z,
                    sigma_km=sigma,
                    lifetime_min=lifetime,
                    u_km_min=0.8 * u + ju,
                    v_km_min=0.8 * v + jv,
                )
            )
            st.next_id += 1

    def _advect_and_age(self, st: StormState, p: ConvectiveParams, dt_min: float) -> None:
        km_per_cell = settings.cell_km
        for c in st.cells:
            c.age_min += dt_min
            # slight steering update: cells drift toward environmental wind
            su, sv = self._steering(p)
            c.u_km_min += 0.1 * (su - c.u_km_min)
            c.v_km_min += 0.1 * (sv - c.v_km_min)
            c.col += c.u_km_min * dt_min / km_per_cell
            c.row += c.v_km_min * dt_min / km_per_cell
        # remove dead / out-of-domain cells
        st.cells = [
            c for c in st.cells
            if c.intensity > 0.01 and -5 < c.row < settings.GRID_N + 5 and -5 < c.col < settings.GRID_N + 5
        ]

    def _render(self, st: StormState) -> np.ndarray:
        n = settings.GRID_N
        grid = np.full((n, n), BG_DZ, dtype=np.float32)
        km_per_cell = settings.cell_km
        yy, xx = np.mgrid[0:n, 0:n]
        for c in st.cells:
            inten = c.intensity
            if inten <= 0.0:
                continue
            sigma_cells = max(c.sigma_km / km_per_cell, 1.0)
            amp = c.max_z * inten
            # gaussian core
            g = amp * np.exp(-((yy - c.row) ** 2 + (xx - c.col) ** 2) / (2 * sigma_cells ** 2))
            # anvil shield: broader, weaker skirt at maturity
            if c.phase == "mature":
                g += 0.35 * amp * np.exp(-((yy - c.row) ** 2 + (xx - c.col) ** 2) / (2 * (2.2 * sigma_cells) ** 2))
            grid = np.maximum(grid, g)
        # light texture so optical flow has gradients to track
        grid += st.rng.normal(0, NOISE_DZ, size=grid.shape).astype(np.float32)
        return np.clip(grid, 0, 75).astype(np.float32)

    @staticmethod
    def _steering(p: ConvectiveParams) -> tuple[float, float]:
        # 850 hPa wind (m/s) -> storm motion (km/min); storms move ~80% of env wind.
        return 0.8 * p.u850_ms * 0.06, 0.8 * p.v850_ms * 0.06


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))
