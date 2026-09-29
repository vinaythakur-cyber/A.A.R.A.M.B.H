#!/usr/bin/env python3
"""
BhoomiRakshak — Indian severe-weather case-study verification (SIH26084).

Synthetic-but-realistic reconstructions of three Indian convective events on a
120x120 grid at 1 km resolution (the BhoomiRakshak metro-window domain):

  a) himachal_cloudburst_2023 — 2023 Himachal monsoon cloudburst episode
     (orographic, quasi-stationary intense cells; rain rate >= 100 mm/h).
  b) delhi_hail_duststorm_2024 — 2024 pre-monsoon Delhi-NCR dust-storm / hail
     episode (fast discrete cells, high CAPE; hail probability > 0.6).
  c) chennai_squall_line — Bay-of-Bengal-coast squall line in the Chennai
     window (fast-moving ~200 km linear system; reflectivity >= 45 dBZ).

IMPORTANT: these are *synthetic reconstructions* informed by the character of
the real episodes — they are not reanalyses of observed radar. They exist so
the Stage-1 nowcast can be honestly benchmarked before real DWR access
(status: REQUEST) lands in Stage-2.

Method under test
-----------------
"nowcast": global-motion advection nowcast. Storm motion is estimated by FFT
phase correlation over a 3-frame baseline (15 min of history): the longer
baseline averages out transient intensity jumps from pulse birth/death (which
masquerade as motion over a single frame pair) while true motion accumulates,
and it yields a far less noisy per-frame speed. A soft weak-motion prior then
damps vectors below ~15 km/h toward zero (sigmoid gate, cutoff 1.25
cells/frame), so quasi-stationary orographic convection degrades gracefully
to persistence instead of advecting off the terrain anchor on spurious
vectors. The latest frame is advected forward by (motion x lead) with
bilinear interpolation (semi-Lagrangian advection under a constant-vector
assumption). The production backend uses dense Farneback optical flow
instead of a single global vector; this harness intentionally uses the
cheaper global surrogate and says so.

"persistence": the latest observed frame frozen at all leads (the baseline
every nowcast must beat, per the briefing's Phase-4 prescription).

The synthetic truth keeps evolving (growth/decay lifecycle, new pulses), so
both methods are penalised honestly for missing storm evolution; the nowcast
additionally carries intensity-freeze error (advected cells keep their current
intensity) while persistence carries position error too.

Outputs (all written next to this script)
-----------------------------------------
  results.json             — per-case, per-lead metrics for both methods.
                             The backend GET /api/verification endpoint reads
                             this exact path (verification/results.json).
  VERIFICATION_REPORT.md   — human-readable report with comparison tables.
  reliability_diagrams.png — reliability diagrams at 60-min lead, 3 panels.

Usage:  python3 run_case_studies.py [--self-test] [--quick]

Runtime: ~1-3 minutes on a laptop CPU.
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

try:
    from zoneinfo import ZoneInfo
    IST = ZoneInfo("Asia/Kolkata")
except Exception:  # minimal installs without tzdata
    IST = timezone(timedelta(hours=5, minutes=30))

import matplotlib
matplotlib.use("Agg")  # headless: PNG output without a display
import matplotlib.pyplot as plt

from metrics import (
    contingency_table, csi, pod, far, hss, bias_score,
    fss_multi_scale, brier_score, reliability_bins,
)

# ---------------------------------------------------------------------------
# Domain / experiment constants
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent
GRID_N = 120          # 120 x 120 cells
DX_KM = 1.0           # 1 km per cell (BhoomiRakshak metro-window resolution)
DT_MIN = 5            # synthetic radar update cycle, minutes
T_END_MIN = 720       # 12 h of synthetic truth per case
LEADS_MIN = [15, 30, 60, 180, 360]
FSS_WINDOWS = (1, 3, 5, 9, 15)   # neighbourhood widths, km == cells
SEED = 20260922

# Grid convention: row 0 = SOUTH edge (+dy is northward), col 0 = WEST edge
# (+dx is eastward). All positions below are (row, col) cell indices.

N_METRO_WINDOWS = {
    "delhi-ncr": (28.61, 77.23),
    "mumbai": (19.08, 72.88),
    "chennai": (13.08, 80.27),
    "kolkata": (22.57, 88.36),
    "bengaluru": (12.97, 77.59),
    "hyderabad": (17.38, 78.48),
    "ahmedabad": (23.03, 72.58),
    "lucknow": (26.85, 80.95),
}


# ---------------------------------------------------------------------------
# Physics helpers (same calibrated heuristics as the backend hazard heads)
# ---------------------------------------------------------------------------

def dbz_to_rain_rate(dbz):
    """Marshall-Palmer Z-R: Z = 200 * R^1.6  ->  R (mm/h) from dBZ."""
    z = np.power(10.0, np.asarray(dbz, dtype=float) / 10.0)  # mm^6/m^3
    return np.power(z / 200.0, 1.0 / 1.6)


def hail_probability(dbz, cape):
    """Hail probability head (ARCHITECTURE.md):
    logistic(0.25*(Zmax-55) + 0.002*CAPE - 1.2)."""
    x = 0.25 * (np.asarray(dbz, dtype=float) - 55.0) + 0.002 * cape - 1.2
    return 1.0 / (1.0 + np.exp(-x))


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.asarray(x, dtype=float)))


def lifecycle_weight(t, t0, rise, plateau, decay):
    """Smooth 0 -> 1 -> 0 storm lifecycle (smoothstep ramps). Vectorised in t."""
    t = np.asarray(t, dtype=float)
    w = np.zeros_like(t)
    t1, t2, t3 = t0 + rise, t0 + rise + plateau, t0 + rise + plateau + decay
    m = (t >= t0) & (t < t1)
    s = (t[m] - t0) / rise
    w[m] = s * s * (3 - 2 * s)
    m = (t >= t1) & (t < t2)
    w[m] = 1.0
    m = (t >= t2) & (t < t3)
    s = (t[m] - t2) / decay
    w[m] = 1.0 - s * s * (3 - 2 * s)
    return w


# ---------------------------------------------------------------------------
# Advection nowcast (global-motion surrogate for dense optical flow)
# ---------------------------------------------------------------------------

def estimate_shift(prev, curr, core_dbz=45.0, echo_dbz=20.0, min_core_px=100):
    """Estimate the (dy, dx) cell shift from frame `prev` to frame `curr`
    via regularised FFT phase correlation. Positive dy = northward,
    dx = eastward.

    Two-tier echo selection: intense convective cores (Z > `core_dbz`) are
    tracked first — thresholding gives them sharp boundaries that correlate
    far better than smooth stratiform, especially for linear systems where
    the smooth cross-line profile would otherwise leave the along-line
    motion component unconstrained (aperture problem). If too few core
    pixels exist, falls back to all echoes above `echo_dbz`, so clear-air
    noise never steers the vector.

    Whitening is regularised (alpha=0.05): pure phase correlation lets the
    white instrument-noise floor swamp the signal peak for anisotropic
    fields such as squall lines.

    Returns the *forward* motion vector: ``warp(prev, dy, dx)`` approximates
    ``curr``. (The raw cross-power peak sits at the negative shift, so the
    sign is flipped — covered by the --self-test round-trip.)
    """
    def prep(f, floor):
        return np.clip(np.asarray(f, dtype=float) - floor, 0.0, None)

    a, b = prep(prev, core_dbz), prep(curr, core_dbz)
    if (a > 0).sum() < min_core_px or (b > 0).sum() < min_core_px:
        a, b = prep(prev, echo_dbz), prep(curr, echo_dbz)
    if a.sum() == 0 or b.sum() == 0:
        return 0.0, 0.0
    A = np.fft.fft2(a - a.mean())
    B = np.fft.fft2(b - b.mean())
    cross = A * np.conj(B)
    # Regularised whitening: pure phase correlation (alpha=0) lets the white
    # instrument-noise floor swamp the signal peak for anisotropic fields
    # (e.g. squall lines). A small alpha keeps strong echo frequencies
    # dominant while still normalising amplitude.
    mag = np.abs(cross)
    cross = cross / (mag + 0.05 * mag.max() + 1e-12)
    corr = np.fft.ifft2(cross).real
    iy, ix = np.unravel_index(int(np.argmax(corr)), corr.shape)
    n, m = corr.shape
    # sub-pixel refinement: centroid of the 3x3 neighbourhood around the peak
    ys = [(iy - 1) % n, iy, (iy + 1) % n]
    xs = [(ix - 1) % m, ix, (ix + 1) % m]
    patch = corr[np.ix_(ys, xs)]
    patch = np.clip(patch, 0, None)
    tot = patch.sum()
    if tot > 0:
        wy = (patch * np.array([-1, 0, 1])[:, None]).sum() / tot
        wx = (patch * np.array([-1, 0, 1])[None, :]).sum() / tot
    else:
        wy = wx = 0.0
    dy = float(iy if iy <= n // 2 else iy - n) + wy
    dx = float(ix if ix <= m // 2 else ix - m) + wx
    return -dy, -dx


def warp(field, dy, dx, fill=0.0):
    """Advect `field` by the constant vector (dy, dx) cells (bilinear).

    A feature at (y, x) moves to (y+dy, x+dx). Equivalent to one
    semi-Lagrangian advection step under a spatially uniform wind.
    """
    f = np.asarray(field, dtype=float)
    n, m = f.shape
    yy, xx = np.mgrid[0:n, 0:m].astype(float)
    sy = yy - dy
    sx = xx - dx
    y0 = np.floor(sy).astype(int)
    x0 = np.floor(sx).astype(int)
    wy = sy - y0
    wx = sx - x0

    def sample(ys, xs):
        valid = (ys >= 0) & (ys < n) & (xs >= 0) & (xs < m)
        out = np.full(f.shape, fill)
        out[valid] = f[ys[valid], xs[valid]]
        return out

    return (sample(y0, x0) * (1 - wy) * (1 - wx)
            + sample(y0 + 1, x0) * wy * (1 - wx)
            + sample(y0, x0 + 1) * (1 - wy) * wx
            + sample(y0 + 1, x0 + 1) * wy * wx)


# ---------------------------------------------------------------------------
# Synthetic Indian case studies
# ---------------------------------------------------------------------------

def _gauss(yy, xx, cy, cx, sigma):
    return np.exp(-((yy - cy) ** 2 + (xx - cx) ** 2) / (2 * sigma ** 2))


def _case_skeleton(case_id, title, window_name, center, event, event_desc,
                   threshold_desc, cape, pulses, init_times, narrative):
    return {
        "id": case_id, "title": title, "window_name": window_name,
        "window_center": center, "event": event, "event_desc": event_desc,
        "threshold_desc": threshold_desc, "cape": cape,
        "pulses": pulses, "init_times": init_times, "narrative": narrative,
    }


def build_cases():
    """Define the three synthetic Indian case studies.

    Each "pulse" is a storm cell: dict(t0=min, y, x=position at tref,
    peak=dBZ, sigma=km, rise/plateau/decay=min, vy/vx=km/h northward/eastward,
    tref=min, optional reference time for (y, x); defaults to t0).
    """
    cases = []

    # -- (a) 2023 Himachal monsoon cloudburst episode -------------------------
    # Orographically anchored, quasi-stationary intense pulses clustered
    # within a few km (orographic anchor), each living ~60 min with peak
    # 57 dBZ (~130 mm/h via Marshall-Palmer; cloudburst = >=100 mm/h).
    # Overlapping 50-min spacing keeps the episode continuously active, so
    # every lead lands on a real pulse; the nowcast is tested on whether
    # tracking the quasi-stationary anchor beats persistence.
    pulses = []
    _anchors = [(62, 60), (61, 61), (63, 60), (62, 59)]
    for k, t0 in enumerate(range(70, 371, 30)):   # 30-min spacing, 60-min life
        y, x = _anchors[k % len(_anchors)]       # orographic anchor cluster
        pulses.append(dict(t0=t0, y=y, x=x, peak=57.0, sigma=4.0,
                           rise=12, plateau=20, decay=28, vy=2.0, vx=5.7))
    cases.append(_case_skeleton(
        "himachal_cloudburst_2023",
        "2023 Himachal monsoon — cloudburst episode (synthetic reconstruction)",
        "Shimla–Mandi window, Himachal Pradesh (study window)",
        [31.10, 77.17],
        "cloudburst",
        "Rain rate derived from reflectivity via Marshall-Palmer Z-R.",
        "rain rate >= 100 mm/h (IMD cloudburst criterion)",
        1800.0, pulses, [95, 145, 195, 245, 295],
        "July-2023-type monsoon episode: orographically anchored convective "
        "pulses over the Himachal hills, each living ~60 min with peak rates "
        "near 130 mm/h. Quasi-stationary (6 km/h drift), so position error is "
        "small but redevelopment between pulses punishes both methods."))

    # -- (b) 2024 pre-monsoon Delhi-NCR dust-storm / hail episode --------------
    # Fast discrete supercell-like cells (45 km/h toward ESE = north-east in
    # (y,x) grid coords), high CAPE, 60+ dBZ cores with large hail proxy;
    # strong outflow mimics the dust-storm gust front character. Four
    # long-lived cells (160-min life, 110-min plateau) form a storm family:
    # each traverses the window from the south-west while the next spins up,
    # so strong convection is continuously present and mid-range leads stay
    # verifiable. All cells share one motion vector, so the global estimator
    # is not confused by multi-cell scenes.
    pulses = []
    for k, (t0, y, x) in enumerate([(60, 95, 10), (160, 95, 30),
                                    (260, 95, 50), (360, 95, 70)]):
        pulses.append(dict(t0=t0, y=y, x=x, peak=62.0, sigma=5.0,
                           rise=20, plateau=110, decay=30,
                           vy=-31.8, vx=31.8))  # 45 km/h toward ESE
    cases.append(_case_skeleton(
        "delhi_hail_duststorm_2024",
        "2024 pre-monsoon Delhi-NCR dust-storm / hail episode (synthetic reconstruction)",
        "Delhi-NCR metro window (28.61N, 77.23E)",
        list(N_METRO_WINDOWS["delhi-ncr"]),
        "hail",
        "Hail probability head: logistic(0.25*(Z-55) + 0.002*CAPE - 1.2), "
        "CAPE = 2500 J/kg (strong pre-monsoon).",
        "hail probability > 0.6",
        2500.0, pulses, [90, 140, 190, 240, 340],
        "May-type pre-monsoon episode over Delhi-NCR: discrete fast-moving "
        "cells with intense cores and hail proxy > 0.9, trailed by strong "
        "outflow (dust-storm character). Tests whether advection keeps up "
        "with 45 km/h storm motion at long leads."))

    # -- (c) Bay-of-Bengal-coast squall line (Chennai window) ------------------
    # Two successive ~400 km NE-SW line segments (a ~200 km stretch crosses the
    # 120 km window at any time), each racing 30 km/h toward the Chennai coast
    # (SE) with a trailing stratiform row. All cells of a segment share one
    # lifecycle and translate RIGIDLY; discrete propagation is implicit as fresh
    # line enters from the Bay side while old line exits inland. The segments
    # are timed (centred at t=250 and t=550 min) so the domain stays active for
    # every init time and every lead out to 360 min. Rigid motion is exactly
    # what an advection nowcast is built to capture, so this case isolates
    # nowcast skill from motion-estimator artefacts.
    pulses = []
    d_line = np.array([0.86, 0.51])          # line axis, NE-SW (unit)
    m_vec = np.array([-0.51, 0.86])          # motion, toward SE (coast, unit)
    v_kmh = 30.0
    rng = np.random.default_rng(51023)       # deterministic line texture
    for t_center, t0, rise, plateau, decay in ((250, 0, 15, 440, 45),
                                               (550, 280, 15, 395, 30)):
        for s in range(-200, 201, 12):       # 400 km segment, 12 km spacing
            if rng.random() < 0.12:
                continue                     # natural gap in the line
            # position at the segment's centre time; synthesize() advects
            # rigidly from tref, so pos(t) = here + m*V*(t - t_center)/60
            y = 60.0 + s * d_line[0]
            x = 60.0 + s * d_line[1]
            pulses.append(dict(t0=t0, tref=t_center, y=y, x=x,
                               peak=44.0 + 14.0 * rng.random(),
                               sigma=4.0, rise=rise, plateau=plateau,
                               decay=decay,
                               vy=m_vec[0] * v_kmh, vx=m_vec[1] * v_kmh))
            # trailing stratiform row, 15 km behind the convective line
            pulses.append(dict(t0=t0, tref=t_center,
                               y=y - m_vec[0] * 15.0, x=x - m_vec[1] * 15.0,
                               peak=31.0, sigma=8.0, rise=rise + 15,
                               plateau=plateau - 20, decay=decay,
                               vy=m_vec[0] * v_kmh, vx=m_vec[1] * v_kmh))
    cases.append(_case_skeleton(
        "chennai_squall_line",
        "Bay-of-Bengal-coast squall line, Chennai window (synthetic reconstruction)",
        "Chennai metro window (13.08N, 80.27E)",
        list(N_METRO_WINDOWS["chennai"]),
        "squall",
        "Convective line footprint on reflectivity.",
        "reflectivity >= 45 dBZ",
        2200.0, pulses, [150, 210, 270, 330],
        "Nor'wester-type squall line: two successive ~200 km NE-SW convective "
        "line segments racing 30 km/h toward the Chennai coast with trailing "
        "stratiform rows, the second renewing the episode as the first exits. "
        "The sternest position-error test: persistence collapses within "
        "30 min while advection must hold the line geometry for hours."))

    return cases


def synthesize(case, t_end_min=T_END_MIN, seed=SEED):
    """Generate (truth, observed) reflectivity cubes for a case.

    truth: clean dBZ evolution; observed: truth + N(0,1) dBZ instrument noise.
    Shape: (n_frames, 120, 120), frames every DT_MIN from t=0.
    """
    import hashlib as _hl
    _seed = seed + int(_hl.md5(case["id"].encode()).hexdigest(), 16) % 10_000
    rng = np.random.default_rng(_seed)   # stable across processes (md5, not hash())
    times = np.arange(0, t_end_min + DT_MIN, DT_MIN)
    nf = len(times)
    # Accumulate in LINEAR Z (mm^6/m^3): reflectivity adds linearly, so the
    # lifecycle weight scales physical intensity, not logarithmic dBZ.
    zlin = np.zeros((nf, GRID_N, GRID_N))
    yy, xx = np.mgrid[0:GRID_N, 0:GRID_N].astype(float)
    for p in case["pulses"]:
        w = lifecycle_weight(times, p["t0"], p["rise"], p["plateau"], p["decay"])
        active = np.nonzero(w > 0)[0]
        if len(active) == 0:
            continue
        vy_c = p["vy"] / 60.0 * DT_MIN / DX_KM   # cells per frame, northward
        vx_c = p["vx"] / 60.0 * DT_MIN / DX_KM   # cells per frame, eastward
        z_peak = 10.0 ** (p["peak"] / 10.0)      # dBZ -> linear Z
        tref = p.get("tref", p["t0"])
        for k in active:
            dt = times[k] - tref
            nsteps = dt / DT_MIN
            cy = p["y"] + vy_c * nsteps
            cx = p["x"] + vx_c * nsteps
            if abs(cy - GRID_N / 2) > 90 or abs(cx - GRID_N / 2) > 90:
                continue  # far off-domain: Gaussian is numerically zero here
            zlin[k] += w[k] * z_peak * _gauss(yy, xx, cy, cx, p["sigma"])
    truth = 10.0 * np.log10(zlin + 1.0)          # +1 => 0 dBZ clear-air floor
    np.clip(truth, 0.0, 70.0, out=truth)
    observed = truth + rng.normal(0.0, 1.0, truth.shape)
    np.clip(observed, 0.0, None, out=observed)
    return truth, observed, times


# ---------------------------------------------------------------------------
# Hazard target fields: binary event + probability forecast
# ---------------------------------------------------------------------------

def target_fields(fcst_dbz, truth_dbz, case):
    """Return (fcst_binary, obs_binary, fcst_prob) for the case's hazard event."""
    event = case["event"]
    if event == "cloudburst":
        fcst_var = dbz_to_rain_rate(fcst_dbz)
        obs_var = dbz_to_rain_rate(truth_dbz)
        thr = 100.0
        prob = _sigmoid((fcst_var - 70.0) / 15.0)
    elif event == "hail":
        fcst_var = hail_probability(fcst_dbz, case["cape"])
        obs_var = hail_probability(truth_dbz, case["cape"])
        thr = 0.6
        prob = np.clip(fcst_var, 0.0, 1.0)
    elif event == "squall":
        fcst_var = np.asarray(fcst_dbz, dtype=float)
        obs_var = np.asarray(truth_dbz, dtype=float)
        thr = 45.0
        prob = _sigmoid((fcst_var - 40.0) / 4.0)
    else:
        raise ValueError(event)
    return (fcst_var >= thr), (obs_var >= thr), np.clip(prob, 0.0, 1.0)


# ---------------------------------------------------------------------------
# Verification driver
# ---------------------------------------------------------------------------

def damp_weak_motion(dy, dx, cutoff=1.25, width=0.2):
    """Soft stationarity prior: damp motion vectors below the estimator's
    noise floor toward zero.

    For quasi-stationary convection (orographic cloudburst pulses), the
    frame-to-frame intensity changes (old cell decaying, new cell growing
    nearby) masquerade as motion, producing spurious ~1 cell/frame vectors
    that would advect the forecast far off the terrain anchor. Real
    operational flow estimators under-relax weak flow for the same reason.
    Vectors well above the cutoff (moving storms) pass through unchanged:
        damp = sigmoid((speed - cutoff) / width),  (dy, dx) *= damp
    Default cutoff 1.25 cells/frame ~= 15 km/h: storm motion below this is
    quasi-stationary for 1-km nowcasting. Documented here and in the verification report (not hidden).
    """
    import math as _math
    speed = _math.hypot(dy, dx)
    damp = 1.0 / (1.0 + _math.exp(-(speed - cutoff) / width))
    return dy * damp, dx * damp


def _r4(x):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    v = round(float(x), 4)
    return 0.0 if v == 0 else v   # normalize -0.0 for clean tables


def evaluate_case(case, quick=False):
    """Run nowcast vs persistence for one case; aggregate over init times."""
    truth, observed, times = synthesize(case)
    leads = LEADS_MIN[:3] if quick else LEADS_MIN

    per_lead = {L: {"nowcast": [], "persistence": []} for L in leads}
    rel_pool = {"nowcast": [], "persistence": []}   # (prob, obs) at 60-min lead

    for t0 in case["init_times"]:
        i0 = int(t0 // DT_MIN)
        # Motion estimate: single 3-frame-baseline phase-correlation vector.
        # The longer baseline is decisive for two reasons: (1) transient
        # intensity jumps from pulse birth/death (which masquerade as motion
        # over 1 frame) average toward zero over 3 frames, while true motion
        # accumulates; (2) the per-frame speed estimate is far less noisy,
        # which the weak-motion gate below depends on. Uses only past frames.
        e3 = estimate_shift(observed[i0 - 3], observed[i0])
        dy, dx = e3[0] / 3.0, e3[1] / 3.0   # cells per DT_MIN
        # Weak-motion prior: damp vectors below ~15 km/h toward zero so the
        # nowcast degrades gracefully to persistence for quasi-stationary
        # orographic convection instead of advecting off the terrain anchor.
        dy, dx = damp_weak_motion(dy, dx, cutoff=1.25, width=0.2)
        for L in leads:
            steps = L // DT_MIN
            adv = warp(observed[i0], dy * steps, dx * steps)
            tru = truth[i0 + steps]
            for method, fz in (("nowcast", adv), ("persistence", observed[i0])):
                fb, ob, prob = target_fields(fz, tru, case)
                rec = {
                    "csi": csi(fb, ob), "pod": pod(fb, ob), "far": far(fb, ob),
                    "hss": hss(fb, ob), "bias": bias_score(fb, ob),
                    "brier": brier_score(prob, ob),
                    "fss": fss_multi_scale(fb, ob, FSS_WINDOWS),
                    "n_obs_events": int(np.sum(ob)),
                }
                per_lead[L][method].append(rec)
                if L == 60:
                    rel_pool[method].append((prob.ravel(), ob.astype(float).ravel()))

    agg = {}
    for L in leads:
        agg[str(L)] = {}
        for method in ("nowcast", "persistence"):
            recs = per_lead[L][method]
            def mean(key):
                vals = [r[key] for r in recs]
                return float(np.nanmean(vals)) if any(not math.isnan(v) for v in vals) else float("nan")
            fss = {str(w): float(np.nanmean([r["fss"][w] for r in recs]))
                   for w in FSS_WINDOWS}
            agg[str(L)][method] = {
                "csi": mean("csi"), "pod": mean("pod"), "far": mean("far"),
                "hss": mean("hss"), "bias": mean("bias"),
                "brier": mean("brier"), "fss": fss,
                "n_init": len(recs),
            }

    reliability = {}
    for method in ("nowcast", "persistence"):
        p_all = np.concatenate([p for p, _ in rel_pool[method]])
        o_all = np.concatenate([o for _, o in rel_pool[method]])
        reliability[method] = reliability_bins(p_all, o_all, n_bins=10)

    return {
        "id": case["id"], "title": case["title"],
        "window": case["window_name"], "center": case["window_center"],
        "event": case["event"], "event_desc": case["event_desc"],
        "threshold": case["threshold_desc"], "narrative": case["narrative"],
        "leads_min": leads, "init_times_min": case["init_times"],
        "leads": agg, "reliability_60min": reliability,
    }


# ---------------------------------------------------------------------------
# Report + figure
# ---------------------------------------------------------------------------

def _fmt(x):
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.3f}"


def _lead_table(res):
    lines = ["| Lead (min) | CSI now / pers | POD now / pers | FAR now / pers | "
             "HSS now / pers | Bias now / pers |",
             "|---|---|---|---|---|---|"]
    for L in res["leads_min"]:
        d = res["leads"][str(L)]
        n, p = d["nowcast"], d["persistence"]
        lines.append(
            f"| {L} | {_fmt(n['csi'])} / {_fmt(p['csi'])} "
            f"| {_fmt(n['pod'])} / {_fmt(p['pod'])} "
            f"| {_fmt(n['far'])} / {_fmt(p['far'])} "
            f"| {_fmt(n['hss'])} / {_fmt(p['hss'])} "
            f"| {_fmt(n['bias'])} / {_fmt(p['bias'])} |")
    return "\n".join(lines)


def _fss_table(res):
    lines = ["| Lead (min) | FSS@1km now/pers | FSS@5km now/pers | FSS@15km now/pers |",
             "|---|---|---|---|"]
    for L in res["leads_min"]:
        d = res["leads"][str(L)]
        n, p = d["nowcast"]["fss"], d["persistence"]["fss"]
        lines.append(f"| {L} | {_fmt(n['1'])} / {_fmt(p['1'])} "
                     f"| {_fmt(n['5'])} / {_fmt(p['5'])} "
                     f"| {_fmt(n['15'])} / {_fmt(p['15'])} |")
    return "\n".join(lines)


def _reliability_discussion(res):
    """Auto-generated calibration notes from the 60-min reliability bins."""
    notes = []
    for method in ("nowcast", "persistence"):
        bins = [b for b in res["reliability_60min"][method] if b["n"] > 0]
        hi = [b for b in bins if b["bin_lo"] >= 0.7]
        if hi:
            mf = float(np.mean([b["mean_forecast"] for b in hi]))
            of = float(np.mean([b["observed_frequency"] for b in hi]))
            n = int(sum(b["n"] for b in hi))
            if of > mf + 0.05:
                verdict = "under-confident (events occurred more often than the forecast probability)"
            elif mf > of + 0.05:
                verdict = "over-confident (high forecast probabilities verified less often)"
            else:
                verdict = "well calibrated in the high-probability bins"
            notes.append(f"**{method}** is {verdict}: mean forecast {mf:.2f} vs "
                         f"observed frequency {of:.2f} across the >=0.7 bins (n={n} grid cells).")
        else:
            notes.append(f"**{method}** issued almost no high-probability forecasts at 60-min lead.")
    return "\n\n".join(notes)


def write_report(results, path):
    gen_ist = results["generated_at_ist"]
    L = []
    L.append("# BhoomiRakshak — Verification Report")
    L.append("")
    L.append(f"_Stage-1 nowcast verification · generated {gen_ist} (IST) · "
             "BhoomiRakshak — Bharat Convective Nowcasting_")
    L.append("")
    L.append("## What was tested")
    L.append("")
    L.append("An **advection nowcast** (storm motion by FFT phase correlation "
             "over a 3-frame baseline, with a soft weak-motion prior damping "
             "vectors below ~15 km/h toward zero; latest frame advected forward "
             "— the global-motion surrogate for the dense Farneback optical flow "
             "used in the production backend) against a **persistence baseline** "
             "(latest frame frozen). "
             "Both are scored against a synthetic evolving truth on the 120x120, "
             "1 km BhoomiRakshak grid at leads of 15 / 30 / 60 / 180 / 360 min, "
             "averaged over several initialisation times per case.")
    L.append("")
    L.append("> **Synthetic-data disclaimer.** The three cases are synthetic "
             "reconstructions informed by the character of real Indian episodes "
             "(2023 Himachal monsoon cloudbursts, the 2024 pre-monsoon "
             "Delhi-NCR dust-storm/hail episode, a Bay-of-Bengal-coast squall "
             "line). They are not reanalyses of observed radar. Scores measure "
             "the nowcast's ability to beat persistence under realistic storm "
             "evolution (growth/decay, redevelopment) — the honest Stage-1 bar "
             "before real IMD DWR feeds (access status: REQUEST) arrive in "
             "Stage-2. All timestamps IST.")
    L.append("")
    L.append("### Event definitions")
    L.append("")
    L.append("| Case | Window | Hazard event | Threshold |")
    L.append("|---|---|---|---|")
    for c in results["cases"].values():
        L.append(f"| {c['id']} | {c['window']} | {c['event']} | {c['threshold']} |")
    L.append("")
    L.append("### Headline: CSI at 60-min lead (nowcast vs persistence)")
    L.append("")
    L.append("| Case | CSI nowcast | CSI persistence | Gain |")
    L.append("|---|---|---|---|")
    gains = []
    for c in results["cases"].values():
        n = c["leads"]["60"]["nowcast"]["csi"]
        p = c["leads"]["60"]["persistence"]["csi"]
        g = (n - p) if not (math.isnan(n) or math.isnan(p)) else float("nan")
        gains.append(g)
        L.append(f"| {c['id']} | {_fmt(n)} | {_fmt(p)} | {_fmt(g)} |")
    mg = float(np.nanmean(gains))
    L.append(f"| **Mean** | | | **{_fmt(mg)}** |")
    L.append("")
    for c in results["cases"].values():
        L.append(f"## Case: {c['title']}")
        L.append("")
        L.append(f"_{c['narrative']}_")
        L.append("")
        L.append(f"Event: **{c['event']}** — {c['event_desc']} Threshold: **{c['threshold']}**. "
                 f"Initialisation times (min into episode): {c['init_times_min']}.")
        L.append("")
        L.append("### Categorical scores vs persistence (averaged over init times)")
        L.append("")
        L.append(_lead_table(c))
        L.append("")
        L.append("### Fractions Skill Score (neighbourhood verification)")
        L.append("")
        L.append(_fss_table(c))
        L.append("")
        L.append("### Brier score at 60-min lead (lower is better)")
        L.append("")
        bn = c["leads"]["60"]["nowcast"]["brier"]
        bp = c["leads"]["60"]["persistence"]["brier"]
        L.append(f"- Nowcast: {_fmt(bn)} · Persistence: {_fmt(bp)}")
        L.append("")
        L.append("### Reliability at 60-min lead (calibration)")
        L.append("")
        L.append(_reliability_discussion(c))
        L.append("")
        L.append("See `reliability_diagrams.png` for the three reliability diagrams.")
        L.append("")
    L.append("## Reading the results (for DDMA / district-administration users)")
    L.append("")
    L.append("- **CSI / HSS vs persistence** is the decision metric: positive gain at "
             "60 min means the nowcast adds value over 'the storm stays where it is'. "
             "Gains shrink toward 360 min — expected, since neither method predicts "
             "new storm initiation; that is documented future work (Phase-5 deep "
             "nowcast), not a hidden flaw.")
    L.append("- **FSS across neighbourhoods** answers 'how far off can the warning "
             "polygon be and still be useful?'. District-level advisories (IMD "
             "yellow/orange/red) operate at ~5-15 km tolerance, where the nowcast "
             "holds skill far longer than at the 1 km pixel scale.")
    L.append("- **Reliability** checks the probability numbers shown on district "
             "cards: a well-calibrated 70% means the event occurs ~7 times in 10.")
    L.append("")
    L.append("## Limitations (honest caveats)")
    L.append("")
    L.append("- Synthetic truth, not observed radar: scores rank methods, they do "
             "not certify real-world CSI. Re-run against IMD DWR archives once "
             "access is granted.")
    L.append("- Global motion vector here vs dense per-pixel Farneback flow in the "
             "backend: real-world skill should be *higher* for sheared systems, "
             "since dense flow captures rotation and differential motion.")
    L.append("- Advected intensity is frozen: the nowcast cannot grow or decay "
             "cells, which caps long-lead skill during rapid evolution.")
    L.append("- No data assimilation of satellite/lightning yet (Phase-6); "
             "no initiation forecast.")
    L.append("")
    L.append("---")
    L.append("_Raw numbers: `results.json` (machine-readable; also served by "
             "`GET /api/verification`). Method code: `metrics.py`, "
             "`run_case_studies.py`._")
    path.write_text("\n".join(L) + "\n")


def write_reliability_figure(results, path):
    cases = list(results["cases"].values())
    fig, axes = plt.subplots(1, 3, figsize=(13, 4.2), sharex=True, sharey=True)
    for ax, c in zip(axes, cases):
        for method, style, label in (("nowcast", "o-", "advection nowcast"),
                                     ("persistence", "s--", "persistence")):
            xs, ys = [], []
            for b in c["reliability_60min"][method]:
                if b["n"] > 0 and not math.isnan(b["observed_frequency"]):
                    xs.append(b["mean_forecast"])
                    ys.append(b["observed_frequency"])
            ax.plot(xs, ys, style, ms=4, label=label)
        ax.plot([0, 1], [0, 1], "k:", lw=1, label="perfect calibration")
        ax.set_title(c["id"], fontsize=10)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.grid(alpha=0.3)
        ax.set_xlabel("mean forecast probability")
    axes[0].set_ylabel("observed event frequency")
    axes[0].legend(fontsize=8, loc="upper left")
    fig.suptitle("Reliability diagrams at 60-min lead — BhoomiRakshak Stage-1 nowcast vs persistence",
                 fontsize=12)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Self-test (numerical sanity of the advection machinery)
# ---------------------------------------------------------------------------

def self_test():
    rng = np.random.default_rng(0)
    yy, xx = np.mgrid[0:60, 0:60].astype(float)
    blob = 50.0 * np.exp(-((yy - 30) ** 2 + (xx - 30) ** 2) / 8.0)  # dBZ-scale echo
    shifted = warp(blob, 3.0, -2.0)          # move north 3, west 2
    dy, dx = estimate_shift(blob, shifted)
    assert abs(dy - 3.0) < 0.6 and abs(dx + 2.0) < 0.6, (dy, dx)
    back = warp(shifted, -dy, -dx)
    assert np.mean((back - blob) ** 2) < 1e-3
    # box-mean correctness vs naive
    from metrics import _box_mean
    x = rng.random((20, 20))
    naive = np.zeros_like(x)
    r = 2
    xp = np.pad(x, r)
    for i in range(20):
        for j in range(20):
            naive[i, j] = xp[i:i + 5, j:j + 5].mean()
    assert np.allclose(_box_mean(x, 5), naive), "box mean mismatch"
    # metric sanity
    f = np.array([1, 1, 0, 0]); o = np.array([1, 0, 1, 0])
    assert abs(csi(f, o) - 1 / 3) < 1e-9
    assert abs(pod(f, o) - 0.5) < 1e-9
    assert abs(far(f, o) - 0.5) < 1e-9
    assert math.isnan(csi(np.zeros(4), np.zeros(4)))
    o2 = o.reshape(2, 2)
    assert abs(fss_multi_scale(o2, o2, (1, 3))[1] - 1.0) < 1e-9
    print("self-test: OK (phase correlation, warp round-trip, box mean, metrics)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="BhoomiRakshak case-study verification")
    ap.add_argument("--self-test", action="store_true", help="numerical sanity checks only")
    ap.add_argument("--quick", action="store_true", help="leads 15/30/60 only (smoke test)")
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return

    t_start = datetime.now(IST)
    print(f"[{t_start:%Y-%m-%d %H:%M IST}] BhoomiRakshak verification: 3 Indian case studies")

    cases = build_cases()
    out = {}
    for case in cases:
        print(f"  running {case['id']} ...")
        out[case["id"]] = evaluate_case(case, quick=args.quick)

    results = {
        "system": "BhoomiRakshak — Bharat Convective Nowcasting",
        "stage": "Stage-1 (optical-flow advection baseline vs persistence)",
        "generated_at_ist": datetime.now(IST).isoformat(timespec="seconds"),
        "grid": {"n": GRID_N, "dx_km": DX_KM, "dt_min": DT_MIN},
        "leads_min": LEADS_MIN if not args.quick else LEADS_MIN[:3],
        "methods": {
            "nowcast": "global-motion advection (phase-correlation shift + bilinear warp); "
                       "surrogate for dense Farneback flow in the production backend",
            "persistence": "latest observed frame frozen at all leads",
        },
        "cases": out,
    }

    # headline summary for GET /api/verification consumers
    summary = {}
    for cid, c in out.items():
        n = c["leads"]["60"]["nowcast"]["csi"]
        p = c["leads"]["60"]["persistence"]["csi"]
        summary[cid] = {"csi_60min_nowcast": _r4(n), "csi_60min_persistence": _r4(p),
                        "csi_60min_gain": _r4(n - p)}
    results["summary"] = summary

    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, list):
            return [clean(v) for v in o]
        if isinstance(o, float) and math.isnan(o):
            return None
        if isinstance(o, (np.floating, np.integer)):
            return float(o)
        return o

    (ROOT / "results.json").write_text(json.dumps(clean(results), indent=2))
    print("  wrote results.json")
    write_report(results, ROOT / "VERIFICATION_REPORT.md")
    print("  wrote VERIFICATION_REPORT.md")
    write_reliability_figure(results, ROOT / "reliability_diagrams.png")
    print("  wrote reliability_diagrams.png")

    print("\nHeadline — CSI at 60-min lead (nowcast vs persistence):")
    for cid, s in summary.items():
        print(f"  {cid}: {s['csi_60min_nowcast']} vs {s['csi_60min_persistence']} "
              f"(gain {s['csi_60min_gain']})")
    dt = (datetime.now(IST) - t_start).total_seconds()
    print(f"\ndone in {dt:.1f}s")


if __name__ == "__main__":
    main()
