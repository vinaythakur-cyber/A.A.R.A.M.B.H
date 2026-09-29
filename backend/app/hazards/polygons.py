"""
Contour tracing: hazard field -> GeoJSON polygons.

For each hazard result, we trace the boundary of each severity level using
marching squares (skimage.measure.find_contours), convert pixel contours to
lat/lon polygons, and attach the full ARCHITECTURE.md property set:
hazard, severity, probability, intensity, lead_minutes, valid_time, cell_id,
eta_minutes, advisory.

Design choices:
* One contour per severity level per connected blob: nested polygons (a red
  core inside an orange/yellow halo) are emitted as separate features so the
  frontend can layer them.
* Tiny fragments (< MIN_CELLS cells) are dropped to keep payloads small.
* Coordinates are rounded to 4 decimals (~11 m) and simplified (1e-3 deg)
  with shapely; invalid rings are repaired with buffer(0).
"""
from __future__ import annotations

import itertools
import logging
from datetime import datetime, timezone

import numpy as np
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union

try:
    from skimage import measure
except ImportError:  # pragma: no cover
    measure = None

from ..config import get_region, settings
from . import HazardResult

log = logging.getLogger(__name__)

MIN_CELLS = 12          # ignore fragments smaller than ~12 km²
SIMPLIFY_DEG = 0.0015   # ~150 m
SEV_NAMES = {1: "yellow", 2: "orange", 3: "red"}

# IMD colour-code terminology is used in every advisory; red/orange advisories
# reference the DDMA / district administration per the India-only scope.
ADVISORIES = {
    "lightning": {
        1: "IMD Yellow Alert — Be Aware: thunderstorm with lightning possible. Avoid open fields and tall trees.",
        2: "IMD Orange Alert — Be Prepared: frequent lightning expected. Stay indoors; unplug sensitive equipment.",
        3: "IMD Red Alert — Take Action: intense lightning storm. Seek sturdy shelter immediately; follow DDMA / district administration instructions.",
    },
    "hail": {
        1: "IMD Yellow Alert — Be Aware: small hail possible in thunderstorms. Park vehicles under cover.",
        2: "IMD Orange Alert — Be Prepared: damaging hail likely. Stay indoors away from windows; protect crops.",
        3: "IMD Red Alert — Take Action: severe hailstorm. Seek strong shelter now; follow DDMA / district administration instructions.",
    },
    "downburst": {
        1: "IMD Yellow Alert — Be Aware: strong gusty winds likely. Secure loose objects outdoors.",
        2: "IMD Orange Alert — Be Prepared: damaging wind gusts expected. Avoid weak structures and hoardings.",
        3: "IMD Red Alert — Take Action: violent downburst winds. Take shelter; do not drive; follow DDMA / district administration instructions.",
    },
    "cloudburst": {
        2: "IMD Orange Alert — Be Prepared: extremely heavy rain likely. Avoid low-lying areas; watch for waterlogging.",
        3: "IMD Red Alert — Take Action: cloudburst conditions, flash-flood risk. Move to higher ground; avoid underpasses; follow DDMA / district administration instructions.",
    },
}

ADVISORIES_HI = {
    "lightning": {
        1: "आईएमडी येलो अलर्ट — सचेत रहें: बिजली गिरने की संभावना। खुले मैदानों और ऊँचे पेड़ों से दूर रहें।",
        2: "आईएमडी ऑरेंज अलर्ट — तैयार रहें: बार-बार बिजली गिरने की आशंका। घर के अंदर रहें; संवेदनशील उपकरणों के प्लग निकाल दें।",
        3: "आईएमडी रेड अलर्ट — तुरंत कार्रवाई करें: खतरनाक बिजली वाला तूफ़ान। तुरंत मज़बूत शरण लें; जिला आपदा प्रबंधन प्राधिकरण (DDMA) के निर्देशों का पालन करें।",
    },
    "hail": {
        1: "आईएमडी येलो अलर्ट — सचेत रहें: तूफ़ान में छोटे ओले संभव। वाहनों को छत के नीचे खड़ा करें।",
        2: "आईएमडी ऑरेंज अलर्ट — तैयार रहें: नुकसानदायक ओले की संभावना। खिड़कियों से दूर घर के अंदर रहें; फसलों की सुरक्षा करें।",
        3: "आईएमडी रेड अलर्ट — तुरंत कार्रवाई करें: भीषण ओलावृष्टि। तुरंत मज़बूत शरण लें; DDMA के निर्देशों का पालन करें।",
    },
    "downburst": {
        1: "आईएमडी येलो अलर्ट — सचेत रहें: तेज़ हवाओं की संभावना। बाहर खुली वस्तुओं को सुरक्षित करें।",
        2: "आईएमडी ऑरेंज अलर्ट — तैयार रहें: नुकसानदायक आँधी की आशंका। कमज़ोर संरचनाओं और होर्डिंग्स से दूर रहें।",
        3: "आईएमडी रेड अलर्ट — तुरंत कार्रवाई करें: विध्वंसक आँधी। शरण लें; तूफ़ान में वाहन न चलाएँ; DDMA के निर्देशों का पालन करें।",
    },
    "cloudburst": {
        2: "आईएमडी ऑरेंज अलर्ट — तैयार रहें: अत्यंत भारी वर्षा की संभावना। निचले इलाकों से बचें; जलभराव पर नज़र रखें।",
        3: "आईएमडी रेड अलर्ट — तुरंत कार्रवाई करें: बादल फटने जैसी स्थिति, अचानक बाढ़ का खतरा। ऊँचे स्थान पर जाएँ; अंडरपास से बचें; DDMA के निर्देशों का पालन करें।",
    },
}


def _intensity_string(name: str, value: float, unit: str) -> str:
    if name == "hail":
        return f"{value * 100:.0f}% hail prob"
    if name == "lightning":
        return f"{value:.0f} flashes/km²/hr"
    if name == "downburst":
        return f"{value:.0f} km/h gusts"
    return f"{value:.0f} mm/h"


def _contours_to_polygons(
    field: np.ndarray,
    severity: np.ndarray,
    level: int,
    threshold: float,
    region_id: str,
) -> list[tuple[np.ndarray, float, float]]:
    """
    Marching squares on `field` at `threshold` inside the region window;
    returns list of (rounded lat/lon ring, max_field_inside, 0.0).
    Keeps only contours that lie inside a level-severity blob.
    """
    if measure is None:
        raise RuntimeError("scikit-image is required for contour tracing")
    region = get_region(region_id)
    assert region is not None
    span = settings.GRID_SPAN_DEG
    lat_min = region.center_lat - span / 2
    lon_min = region.center_lon - span / 2
    polys: list[tuple[np.ndarray, float, float]] = []
    try:
        contours = measure.find_contours(field, threshold)
    except ValueError:
        return []
    sev_mask = (severity >= level).astype(np.uint8)
    labelled = measure.label(sev_mask, connectivity=2)
    n = settings.GRID_N
    for contour in contours:
        if len(contour) < 8:
            continue
        # pixel (row, col) -> (lon, lat); find_contours gives (row, col)
        lats = lat_min + (contour[:, 0] + 0.5) / n * span
        lons = lon_min + (contour[:, 1] + 0.5) / n * span
        coords = np.column_stack([lons, lats])
        try:
            poly = Polygon(coords)
        except Exception:
            continue
        if not poly.is_valid:
            poly = poly.buffer(0)
            # buffer(0) repair can split into a MultiPolygon — keep largest part
            if poly.geom_type == "MultiPolygon":
                poly = max(poly.geoms, key=lambda p: p.area)
        if poly.is_empty or poly.geom_type != "Polygon" or not poly.is_valid:
            continue
        if poly.area < (MIN_CELLS / n / n * settings.GRID_SPAN_DEG ** 2):
            continue
        poly = poly.simplify(SIMPLIFY_DEG, preserve_topology=True)
        if poly.is_empty or not poly.is_valid:
            continue
        # round to 4 decimals FIRST: rounding itself can self-intersect tiny
        # polygons, so the final emitted ring is re-validated, not the raw one
        rounded = np.round(np.array(poly.exterior.coords), 4)
        try:
            final = Polygon(rounded)
        except Exception:
            continue
        if not final.is_valid or final.is_empty:
            continue
        # verify the contour actually encloses severity>=level area
        cx, cy = final.centroid.x, final.centroid.y
        col = int((cx - lon_min) / span * n)
        row = int((cy - lat_min) / span * n)
        if 0 <= row < n and 0 <= col < n and labelled[row, col] > 0:
            max_val = float(field[labelled == labelled[row, col]].max())
            polys.append((rounded, max_val, 0.0))
    return polys


def result_to_features(
    result: HazardResult,
    lead_minutes: int,
    valid_time: str,
    region_id: str,
    cell_id_prefix: str = "",
) -> list[dict]:
    """
    Convert one HazardResult into GeoJSON Feature dicts with contract properties
    (plus advisory_hi for the India-only scope).
    cell_id values: e.g. 'C-007' from the storm sim for lead=0, 'F-<lead>-<idx>' for forecast.
    """
    features: list[dict] = []
    region = get_region(region_id)
    assert region is not None
    span = settings.GRID_SPAN_DEG
    lat_min = region.center_lat - span / 2
    lon_min = region.center_lon - span / 2
    thresholds = _level_thresholds(result)
    for level in (3, 2, 1):
        if level not in thresholds:
            continue
        polys = _contours_to_polygons(result.field, result.severity, level, thresholds[level], region_id)
        for idx, (coords, max_val, _) in enumerate(polys):
            n = settings.GRID_N
            # mean probability inside the polygon (sample centroid neighbourhood)
            lon_c, lat_c = coords[:, 0].mean(), coords[:, 1].mean()
            col = int(np.clip((lon_c - lon_min) / span * n, 0, n - 1))
            row = int(np.clip((lat_c - lat_min) / span * n, 0, n - 1))
            prob = float(np.clip(result.probability[
                max(0, row - 2): row + 3, max(0, col - 2): col + 3
            ].mean(), 0.0, 1.0))
            sev_name = SEV_NAMES[level]
            cell_id = (
                f"{cell_id_prefix}{idx:03d}" if cell_id_prefix
                else f"{result.name[0].upper()}-{lead_minutes:03d}-{idx:02d}"
            )
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[round(float(x), 4), round(float(y), 4)] for x, y in coords]],
                },
                "properties": {
                    "hazard": result.name,
                    "severity": sev_name,
                    "probability": round(prob, 3),
                    "intensity": _intensity_string(result.name, max_val, result.unit_label),
                    "lead_minutes": lead_minutes,
                    "valid_time": valid_time,
                    "cell_id": cell_id,
                    "eta_minutes": lead_minutes,
                    "advisory": ADVISORIES[result.name].get(level, ADVISORIES[result.name][2]),
                    "advisory_hi": ADVISORIES_HI[result.name].get(level, ADVISORIES_HI[result.name][2]),
                },
            })
    return features


def _level_thresholds(result: HazardResult) -> dict[int, float]:
    """Recover the severity cutoffs used by each head (must mirror head constants)."""
    if result.name == "lightning":
        return {1: 30.0, 2: 80.0, 3: 150.0}
    if result.name == "hail":
        return {1: 0.35, 2: 0.60, 3: 0.80}
    if result.name == "downburst":
        return {1: 70.0, 2: 90.0, 3: 110.0}
    if result.name == "cloudburst":
        # cloudburst severity lives on probability, not the mm/h field —
        # handled via probability contours instead.
        return {}
    return {}


def probability_features(
    result: HazardResult,
    lead_minutes: int,
    valid_time: str,
    region_id: str,
) -> list[dict]:
    """Contour the cloudburst probability field (severity defined on p)."""
    if result.name != "cloudburst":
        return []
    region = get_region(region_id)
    assert region is not None
    span = settings.GRID_SPAN_DEG
    lat_min = region.center_lat - span / 2
    lon_min = region.center_lon - span / 2
    features: list[dict] = []
    for level, thresh in ((3, 0.6), (2, 0.35)):
        polys = _contours_to_polygons(result.probability, result.severity, level, thresh, region_id)
        for idx, (coords, max_p, _) in enumerate(polys):
            n = settings.GRID_N
            lon_c, lat_c = coords[:, 0].mean(), coords[:, 1].mean()
            col = int(np.clip((lon_c - lon_min) / span * n, 0, n - 1))
            row = int(np.clip((lat_c - lat_min) / span * n, 0, n - 1))
            peak = float(result.field[max(0, row - 2): row + 3, max(0, col - 2): col + 3].max())
            sev_name = SEV_NAMES[level]
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[round(float(x), 4), round(float(y), 4)] for x, y in coords]],
                },
                "properties": {
                    "hazard": "cloudburst",
                    "severity": sev_name,
                    "probability": round(float(max_p), 3),
                    "intensity": f"{peak:.0f} mm/h",
                    "lead_minutes": lead_minutes,
                    "valid_time": valid_time,
                    "cell_id": f"B-{lead_minutes:03d}-{idx:02d}",
                    "eta_minutes": lead_minutes,
                    "advisory": ADVISORIES["cloudburst"][level],
                    "advisory_hi": ADVISORIES_HI["cloudburst"][level],
                },
            })
    return features
