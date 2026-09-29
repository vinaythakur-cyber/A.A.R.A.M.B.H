# BhoomiRakshak — Verification Harness

Stage-1 verification for the advection nowcast: categorical scores (CSI, POD,
FAR, HSS, frequency bias), neighbourhood FSS, Brier score / Brier skill score,
and reliability diagrams — nowcast vs a persistence baseline — on three
synthetic Indian case studies.

## Setup

```bash
cd verification
pip install -r requirements.txt
```

Needs only NumPy and matplotlib.

## Run

```bash
# quick self-test (estimator, warp round-trip, metric identities)
python3 run_case_studies.py --self-test

# full verification (about 2 seconds; writes outputs below)
python3 run_case_studies.py

# faster smoke run (fewer init times)
python3 run_case_studies.py --quick
```

## Outputs

| File | Contents |
|---|---|
| `results.json` | All scores, machine-readable (also served by `GET /api/verification`) |
| `VERIFICATION_REPORT.md` | Human-readable report with headline table, per-case scores, calibration, caveats |
| `reliability_diagrams.png` | Reliability diagrams at 60-min lead for the three cases |

The run is deterministic (fixed seeds; case id hashed with MD5, not `hash()`),
so repeated runs produce identical numbers.

## Method (what is actually tested)

- **nowcast**: global-motion advection. Motion from FFT phase correlation over
  a 3-frame baseline, soft weak-motion prior (vectors below ~15 km/h damped
  toward zero), latest frame advected forward by motion × lead (bilinear
  semi-Lagrangian). Surrogate for the dense Farneback flow in the backend.
- **persistence**: latest frame frozen (the baseline every nowcast must beat).
- Truth is **synthetic**: three reconstructions informed by real Indian
  episodes (2023 Himachal cloudbursts, 2024 Delhi-NCR dust-storm/hail,
  Bay-of-Bengal-coast squall line) — not observed-radar reanalyses.

## Scores implemented (`metrics.py`)

Contingency-table scores (CSI, POD, FAR, HSS, frequency bias), Fractions Skill
Score at 1/3/5/9/15 km, Brier score and Brier skill score vs persistence, and
reliability bins. All formulas are documented in `metrics.py`.

## Caveats

- Synthetic truth ranks methods; it does not certify real-world CSI. Re-run
  against IMD DWR archives once access is granted (status: REQUEST).
- Global vector here vs dense per-pixel flow in production: real-world skill
  should be higher for sheared systems.
- Advected intensity is frozen: no growth/decay, no initiation forecast
  (Phase-5/6 future work).
