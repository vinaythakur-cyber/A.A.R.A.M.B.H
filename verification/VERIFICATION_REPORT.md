# BhoomiRakshak — Verification Report

_Stage-1 nowcast verification · generated 2026-09-29T17:48:45+05:30 (IST) · BhoomiRakshak — Bharat Convective Nowcasting_

## What was tested

An **advection nowcast** (storm motion by FFT phase correlation over a 3-frame baseline, with a soft weak-motion prior damping vectors below ~15 km/h toward zero; latest frame advected forward — the global-motion surrogate for the dense Farneback optical flow used in the production backend) against a **persistence baseline** (latest frame frozen). Both are scored against a synthetic evolving truth on the 120x120, 1 km BhoomiRakshak grid at leads of 15 / 30 / 60 / 180 / 360 min, averaged over several initialisation times per case.

> **Synthetic-data disclaimer.** The three cases are synthetic reconstructions informed by the character of real Indian episodes (2023 Himachal monsoon cloudbursts, the 2024 pre-monsoon Delhi-NCR dust-storm/hail episode, a Bay-of-Bengal-coast squall line). They are not reanalyses of observed radar. Scores measure the nowcast's ability to beat persistence under realistic storm evolution (growth/decay, redevelopment) — the honest Stage-1 bar before real IMD DWR feeds (access status: REQUEST) arrive in Stage-2. All timestamps IST.

### Event definitions

| Case | Window | Hazard event | Threshold |
|---|---|---|---|
| himachal_cloudburst_2023 | Shimla–Mandi window, Himachal Pradesh (study window) | cloudburst | rain rate >= 100 mm/h (IMD cloudburst criterion) |
| delhi_hail_duststorm_2024 | Delhi-NCR metro window (28.61N, 77.23E) | hail | hail probability > 0.6 |
| chennai_squall_line | Chennai metro window (13.08N, 80.27E) | squall | reflectivity >= 45 dBZ |

### Headline: CSI at 60-min lead (nowcast vs persistence)

| Case | CSI nowcast | CSI persistence | Gain |
|---|---|---|---|
| himachal_cloudburst_2023 | 0.632 | 0.634 | -0.001 |
| delhi_hail_duststorm_2024 | 0.574 | 0.062 | 0.512 |
| chennai_squall_line | 0.264 | 0.000 | 0.264 |
| **Mean** | | | **0.258** |

## Case: 2023 Himachal monsoon — cloudburst episode (synthetic reconstruction)

_July-2023-type monsoon episode: orographically anchored convective pulses over the Himachal hills, each living ~60 min with peak rates near 130 mm/h. Quasi-stationary (6 km/h drift), so position error is small but redevelopment between pulses punishes both methods._

Event: **cloudburst** — Rain rate derived from reflectivity via Marshall-Palmer Z-R. Threshold: **rain rate >= 100 mm/h (IMD cloudburst criterion)**. Initialisation times (min into episode): [95, 145, 195, 245, 295].

### Categorical scores vs persistence (averaged over init times)

| Lead (min) | CSI now / pers | POD now / pers | FAR now / pers | HSS now / pers | Bias now / pers |
|---|---|---|---|---|---|
| 15 | 0.545 / 0.545 | 0.777 / 0.777 | 0.246 / 0.246 | 0.697 / 0.697 | 1.238 / 1.238 |
| 30 | 0.659 / 0.663 | 0.786 / 0.789 | 0.202 / 0.201 | 0.790 / 0.792 | 0.986 / 0.990 |
| 60 | 0.632 / 0.634 | 0.763 / 0.769 | 0.221 / 0.224 | 0.770 / 0.771 | 0.983 / 0.994 |
| 180 | 0.419 / 0.400 | 0.811 / 0.790 | 0.506 / 0.515 | 0.490 / 0.478 | 0.988 / 0.982 |
| 360 | 0.000 / 0.000 | n/a / n/a | 1.000 / 1.000 | 0.000 / 0.000 | n/a / n/a |

### Fractions Skill Score (neighbourhood verification)

| Lead (min) | FSS@1km now/pers | FSS@5km now/pers | FSS@15km now/pers |
|---|---|---|---|
| 15 | 0.699 / 0.699 | 0.860 / 0.861 | 0.855 / 0.855 |
| 30 | 0.791 / 0.793 | 0.946 / 0.948 | 0.982 / 0.983 |
| 60 | 0.771 / 0.772 | 0.938 / 0.938 | 0.979 / 0.979 |
| 180 | 0.490 / 0.479 | 0.574 / 0.574 | 0.591 / 0.591 |
| 360 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |

### Brier score at 60-min lead (lower is better)

- Nowcast: 0.003 · Persistence: 0.003

### Reliability at 60-min lead (calibration)

**nowcast** is over-confident (high forecast probabilities verified less often): mean forecast 0.86 vs observed frequency 0.48 across the >=0.7 bins (n=530 grid cells).

**persistence** is over-confident (high forecast probabilities verified less often): mean forecast 0.86 vs observed frequency 0.48 across the >=0.7 bins (n=531 grid cells).

See `reliability_diagrams.png` for the three reliability diagrams.

## Case: 2024 pre-monsoon Delhi-NCR dust-storm / hail episode (synthetic reconstruction)

_May-type pre-monsoon episode over Delhi-NCR: discrete fast-moving cells with intense cores and hail proxy > 0.9, trailed by strong outflow (dust-storm character). Tests whether advection keeps up with 45 km/h storm motion at long leads._

Event: **hail** — Hail probability head: logistic(0.25*(Z-55) + 0.002*CAPE - 1.2), CAPE = 2500 J/kg (strong pre-monsoon). Threshold: **hail probability > 0.6**. Initialisation times (min into episode): [90, 140, 190, 240, 340].

### Categorical scores vs persistence (averaged over init times)

| Lead (min) | CSI now / pers | POD now / pers | FAR now / pers | HSS now / pers | Bias now / pers |
|---|---|---|---|---|---|
| 15 | 0.946 / 0.374 | 0.981 / 0.549 | 0.036 / 0.460 | 0.970 / 0.514 | 1.019 / 1.019 |
| 30 | 0.601 / 0.066 | 0.704 / 0.120 | 0.115 / 0.853 | 0.720 / 0.064 | 0.901 / 0.931 |
| 60 | 0.574 / 0.062 | 0.628 / 0.112 | 0.086 / 0.861 | 0.678 / 0.056 | 0.705 / 0.969 |
| 180 | 0.000 / 0.000 | 0.000 / 0.000 | n/a / 1.000 | 0.000 / -0.058 | 0.000 / 0.917 |
| 360 | 0.000 / 0.000 | 0.000 / 0.000 | n/a / 1.000 | 0.000 / -0.008 | 0.000 / 1.751 |

### Fractions Skill Score (neighbourhood verification)

| Lead (min) | FSS@1km now/pers | FSS@5km now/pers | FSS@15km now/pers |
|---|---|---|---|
| 15 | 0.972 / 0.544 | 0.997 / 0.604 | 0.999 / 0.713 |
| 30 | 0.738 / 0.124 | 0.755 / 0.140 | 0.759 / 0.193 |
| 60 | 0.694 / 0.115 | 0.707 / 0.130 | 0.694 / 0.174 |
| 180 | 0.000 / 0.000 | 0.000 / 0.004 | 0.000 / 0.034 |
| 360 | 0.000 / 0.000 | 0.000 / -0.000 | 0.000 / 0.000 |

### Brier score at 60-min lead (lower is better)

- Nowcast: 0.038 · Persistence: 0.111

### Reliability at 60-min lead (calibration)

**nowcast** is under-confident (events occurred more often than the forecast probability): mean forecast 0.86 vs observed frequency 0.92 across the >=0.7 bins (n=3084 grid cells).

**persistence** is over-confident (high forecast probabilities verified less often): mean forecast 0.86 vs observed frequency 0.15 across the >=0.7 bins (n=4088 grid cells).

See `reliability_diagrams.png` for the three reliability diagrams.

## Case: Bay-of-Bengal-coast squall line, Chennai window (synthetic reconstruction)

_Nor'wester-type squall line: two successive ~200 km NE-SW convective line segments racing 30 km/h toward the Chennai coast with trailing stratiform rows, the second renewing the episode as the first exits. The sternest position-error test: persistence collapses within 30 min while advection must hold the line geometry for hours._

Event: **squall** — Convective line footprint on reflectivity. Threshold: **reflectivity >= 45 dBZ**. Initialisation times (min into episode): [150, 210, 270, 330].

### Categorical scores vs persistence (averaged over init times)

| Lead (min) | CSI now / pers | POD now / pers | FAR now / pers | HSS now / pers | Bias now / pers |
|---|---|---|---|---|---|
| 15 | 0.703 / 0.166 | 0.784 / 0.288 | 0.143 / 0.710 | 0.805 / 0.251 | 0.908 / 1.017 |
| 30 | 0.576 / 0.006 | 0.677 / 0.013 | 0.244 / 0.988 | 0.689 / -0.031 | 0.884 / 1.319 |
| 60 | 0.264 / 0.000 | 0.331 / 0.000 | 0.448 / 1.000 | 0.360 / -0.039 | 0.668 / 2.567 |
| 180 | 0.014 / 0.000 | 0.015 / 0.000 | 0.846 / 1.000 | 0.023 / -0.039 | 0.056 / 3.695 |
| 360 | 0.000 / 0.000 | 0.000 / 0.000 | n/a / 1.000 | 0.000 / -0.060 | 0.000 / 0.636 |

### Fractions Skill Score (neighbourhood verification)

| Lead (min) | FSS@1km now/pers | FSS@5km now/pers | FSS@15km now/pers |
|---|---|---|---|
| 15 | 0.813 / 0.284 | 0.909 / 0.365 | 0.952 / 0.639 |
| 30 | 0.701 / 0.012 | 0.799 / 0.018 | 0.866 / 0.152 |
| 60 | 0.378 / 0.000 | 0.427 / -0.000 | 0.493 / 0.000 |
| 180 | 0.026 / 0.000 | 0.037 / 0.000 | 0.058 / -0.000 |
| 360 | 0.000 / 0.000 | 0.000 / -0.000 | 0.000 / 0.000 |

### Brier score at 60-min lead (lower is better)

- Nowcast: 0.043 · Persistence: 0.099

### Reliability at 60-min lead (calibration)

**nowcast** is over-confident (high forecast probabilities verified less often): mean forecast 0.84 vs observed frequency 0.48 across the >=0.7 bins (n=2277 grid cells).

**persistence** is over-confident (high forecast probabilities verified less often): mean forecast 0.85 vs observed frequency 0.00 across the >=0.7 bins (n=3370 grid cells).

See `reliability_diagrams.png` for the three reliability diagrams.

## Reading the results (for DDMA / district-administration users)

- **CSI / HSS vs persistence** is the decision metric: positive gain at 60 min means the nowcast adds value over 'the storm stays where it is'. Gains shrink toward 360 min — expected, since neither method predicts new storm initiation; that is documented future work (Phase-5 deep nowcast), not a hidden flaw.
- **FSS across neighbourhoods** answers 'how far off can the warning polygon be and still be useful?'. District-level advisories (IMD yellow/orange/red) operate at ~5-15 km tolerance, where the nowcast holds skill far longer than at the 1 km pixel scale.
- **Reliability** checks the probability numbers shown on district cards: a well-calibrated 70% means the event occurs ~7 times in 10.

## Limitations (honest caveats)

- Synthetic truth, not observed radar: scores rank methods, they do not certify real-world CSI. Re-run against IMD DWR archives once access is granted.
- Global motion vector here vs dense per-pixel Farneback flow in the backend: real-world skill should be *higher* for sheared systems, since dense flow captures rotation and differential motion.
- Advected intensity is frozen: the nowcast cannot grow or decay cells, which caps long-lead skill during rapid evolution.
- No data assimilation of satellite/lightning yet (Phase-6); no initiation forecast.

---
_Raw numbers: `results.json` (machine-readable; also served by `GET /api/verification`). Method code: `metrics.py`, `run_case_studies.py`._
