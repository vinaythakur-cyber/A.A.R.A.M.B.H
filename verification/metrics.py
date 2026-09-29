"""
BhoomiRakshak — verification metrics (SIH26084, India-only).

Pure-NumPy implementations of the categorical and probabilistic scores used to
verify convective nowcasts (advection nowcast vs persistence baseline).

Contingency table convention (binary forecast f, binary observation o):
    a = hits            (f=1, o=1)
    b = false alarms    (f=1, o=0)
    c = misses          (f=0, o=1)
    d = correct negatives (f=0, o=0)

Scores
------
CSI  (Critical Success Index / Threat Score) = a / (a + b + c)
     Rewards hits, penalises both misses and false alarms. Range [0, 1].
POD  (Probability of Detection)              = a / (a + c)
     Fraction of observed events that were forecast. Range [0, 1].
FAR  (False Alarm Ratio)                     = b / (a + b)
     Fraction of forecast events that did not occur. Range [0, 1].
HSS  (Heidke Skill Score)                    = 2(ad - bc) / ((a+c)(c+d) + (a+b)(b+d))
     Skill relative to a random forecast with the same marginals.
     1 = perfect, 0 = no skill over chance, negative = worse than chance.
BIAS (frequency bias)                        = (a + b) / (a + c)
     >1 = over-forecasting, <1 = under-forecasting.
FSS  (Fractions Skill Score, Roberts & Lean 2008)
     Computed on neighbourhood "fraction" fields: for a square window of
     width w cells, each grid point holds the fraction of event pixels
     inside its window, for forecast (F) and observation (O).
         FBS     = mean((F - O)^2)            (fractions Brier score)
         FBS_ref = mean(F^2) + mean(O^2)      (worst-case reference)
         FSS     = 1 - FBS / FBS_ref
     Range [0, 1]; 1 = perfect. FSS grows with window size; a skilful
     forecast reaches FSS >= 0.5 at a smaller window than a poor one, which
     makes it ideal for high-resolution convective verification where a
     few-km displacement should not score zero.
Brier score = mean((p - o)^2) over probability forecast p in [0, 1].
     0 = perfect. Decomposes into reliability - resolution + uncertainty.
Reliability bins: probability forecasts are grouped into bins; per bin we
     report mean forecast probability vs observed event frequency. A
     perfectly calibrated forecast lies on the diagonal.

All functions return float('nan') (never raise) when a score is undefined,
e.g. CSI when no event was forecast or observed. NaNs propagate honestly
through the case-study aggregation instead of being silently dropped.
"""

from __future__ import annotations

import numpy as np

__all__ = [
    "contingency_table",
    "csi", "pod", "far", "hss", "bias_score",
    "fractions_skill_score", "fss_multi_scale",
    "brier_score", "brier_skill_score",
    "reliability_bins",
]


# ---------------------------------------------------------------------------
# Contingency table
# ---------------------------------------------------------------------------

def contingency_table(forecast, observed):
    """Build the 2x2 contingency table from binary forecast/observation arrays.

    Returns dict with integer counts: hits, misses, false_alarms,
    correct_negatives. Any non-zero value counts as an event.
    """
    f = np.asarray(forecast).astype(bool).ravel()
    o = np.asarray(observed).astype(bool).ravel()
    if f.shape != o.shape:
        raise ValueError(f"shape mismatch: {f.shape} vs {o.shape}")
    return {
        "hits": int(np.sum(f & o)),
        "misses": int(np.sum(~f & o)),
        "false_alarms": int(np.sum(f & ~o)),
        "correct_negatives": int(np.sum(~f & ~o)),
    }


def _safe_div(num, den):
    return float(num / den) if den > 0 else float("nan")


def csi(forecast, observed):
    """Critical Success Index = hits / (hits + misses + false_alarms)."""
    t = contingency_table(forecast, observed)
    return _safe_div(t["hits"], t["hits"] + t["misses"] + t["false_alarms"])


def pod(forecast, observed):
    """Probability of Detection = hits / (hits + misses)."""
    t = contingency_table(forecast, observed)
    return _safe_div(t["hits"], t["hits"] + t["misses"])


def far(forecast, observed):
    """False Alarm Ratio = false_alarms / (hits + false_alarms)."""
    t = contingency_table(forecast, observed)
    return _safe_div(t["false_alarms"], t["hits"] + t["false_alarms"])


def hss(forecast, observed):
    """Heidke Skill Score = 2(ad-bc) / ((a+c)(c+d) + (a+b)(b+d))."""
    t = contingency_table(forecast, observed)
    a, b, c, d = t["hits"], t["false_alarms"], t["misses"], t["correct_negatives"]
    den = (a + c) * (c + d) + (a + b) * (b + d)
    return _safe_div(2.0 * (a * d - b * c), den)


def bias_score(forecast, observed):
    """Frequency bias = (hits + false_alarms) / (hits + misses)."""
    t = contingency_table(forecast, observed)
    return _safe_div(t["hits"] + t["false_alarms"], t["hits"] + t["misses"])


# ---------------------------------------------------------------------------
# Fractions Skill Score (neighbourhood verification)
# ---------------------------------------------------------------------------

def _box_mean(x, w):
    """Mean over a w x w window centred on each pixel (w odd), via integral image.

    Zero-padded at the borders. O(N) in the number of pixels.
    """
    x = np.asarray(x, dtype=float)
    if w <= 1:
        return x.copy()
    if w % 2 == 0:
        raise ValueError("window width must be odd")
    r = w // 2
    xp = np.pad(x, r, mode="constant")
    h, wdt = x.shape
    integ = np.zeros((xp.shape[0] + 1, xp.shape[1] + 1))
    integ[1:, 1:] = np.cumsum(np.cumsum(xp, axis=0), axis=1)
    # window for pixel (i, j): xp[i:i+2r+1, j:j+2r+1]
    s = (integ[2 * r + 1:h + 2 * r + 1, 2 * r + 1:wdt + 2 * r + 1]
         - integ[0:h, 2 * r + 1:wdt + 2 * r + 1]
         - integ[2 * r + 1:h + 2 * r + 1, 0:wdt]
         + integ[0:h, 0:wdt])
    return s / (w * w)


def fractions_skill_score(forecast, observed, window):
    """Fractions Skill Score for one neighbourhood window width (in grid cells).

    FSS = 1 - mean((F - O)^2) / (mean(F^2) + mean(O^2)),
    where F, O are the forecast/observed event fractions inside each window.
    Returns NaN when both fields are event-free (reference score is zero).
    """
    f = np.asarray(forecast).astype(float)
    o = np.asarray(observed).astype(float)
    if f.shape != o.shape:
        raise ValueError(f"shape mismatch: {f.shape} vs {o.shape}")
    F = _box_mean((f > 0.5).astype(float), window)
    O = _box_mean((o > 0.5).astype(float), window)
    mse = float(np.mean((F - O) ** 2))
    ref = float(np.mean(F ** 2) + np.mean(O ** 2))
    return _safe_div(ref - mse, ref)


def fss_multi_scale(forecast, observed, windows=(1, 3, 5, 9, 15)):
    """FSS evaluated at several neighbourhood widths.

    Returns {window_width: fss}. On the 1 km BhoomiRakshak grid the window
    width in cells equals kilometres.
    """
    return {int(w): fractions_skill_score(forecast, observed, int(w)) for w in windows}


# ---------------------------------------------------------------------------
# Probabilistic scores
# ---------------------------------------------------------------------------

def brier_score(prob_forecast, observed):
    """Brier score = mean((p - o)^2). 0 is perfect."""
    p = np.asarray(prob_forecast, dtype=float).ravel()
    o = np.asarray(observed).astype(float).ravel()
    if p.shape != o.shape:
        raise ValueError(f"shape mismatch: {p.shape} vs {o.shape}")
    if np.any((p < 0) | (p > 1)):
        raise ValueError("probability forecasts must lie in [0, 1]")
    return float(np.mean((p - o) ** 2))


def brier_skill_score(prob_forecast, observed, climatology=None):
    """BSS = 1 - BS / BS_ref, with reference = constant climatology forecast.

    1 = perfect, 0 = no skill over climatology, negative = worse.
    """
    p = np.asarray(prob_forecast, dtype=float).ravel()
    o = np.asarray(observed).astype(float).ravel()
    bs = brier_score(p, o)
    cref = float(np.mean(o)) if climatology is None else float(climatology)
    bs_ref = float(np.mean((cref - o) ** 2))
    return _safe_div(bs_ref - bs, bs_ref)


def reliability_bins(prob_forecast, observed, n_bins=10):
    """Group probability forecasts into bins; compare mean forecast vs observed frequency.

    Returns a list of dicts: {bin_lo, bin_hi, n, mean_forecast,
    observed_frequency}. Bins with n == 0 carry NaN statistics.
    """
    p = np.asarray(prob_forecast, dtype=float).ravel()
    o = np.asarray(observed).astype(float).ravel()
    if p.shape != o.shape:
        raise ValueError(f"shape mismatch: {p.shape} vs {o.shape}")
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    out = []
    for i in range(n_bins):
        lo, hi = float(edges[i]), float(edges[i + 1])
        if i == 0:
            mask = (p >= lo) & (p <= hi)
        else:
            mask = (p > lo) & (p <= hi)
        n = int(np.sum(mask))
        out.append({
            "bin_lo": lo,
            "bin_hi": hi,
            "n": n,
            "mean_forecast": float(np.mean(p[mask])) if n else float("nan"),
            "observed_frequency": float(np.mean(o[mask])) if n else float("nan"),
        })
    return out
