from __future__ import annotations

import json
import logging
from typing import Dict, Any

import pandas as pd
import geopandas as gpd
from shapely.geometry import shape
from sqlalchemy.orm import Session

from . import models

log = logging.getLogger(__name__)


def run_analytics_engine(db: Session) -> Dict[str, Any]:
    """
    Multi-Hazard Live Fusion & Relocation Carrying Capacity Engine.
    1. Intersects habitations with spatial hazard footprints.
    2. Computes hazard score from cumulative intensity.
    3. Calculates socio-demographic vulnerability index.
    4. Computes priority score = hazard * exposure * vulnerability.
    5. Formulates Explainable AI (XAI) justification.
    6. Performs greedy carrying capacity matching with safe candidate sites.
    7. Assigns action phases: Immediate (Score > 500), Short-Term (Score > 200), Medium-Term.
    """
    # 1. Fetch raw data from DB
    habs_raw = pd.read_sql_query(
        "SELECT id, population, elderly_pct, disabled_pct, income_bracket, housing_quality, geom FROM habitations",
        db.bind,
    )
    hazards_raw = pd.read_sql_query(
        "SELECT id, hazard_type, intensity, geom FROM hazard_zones",
        db.bind,
    )
    sites_raw = pd.read_sql_query(
        "SELECT id, max_capacity, geom FROM candidate_sites",
        db.bind,
    )

    if habs_raw.empty or hazards_raw.empty:
        return {"status": "error", "message": "No habitation or hazard data available in database to run engine"}

    # Convert GeoJSON strings to Shapely geometry
    habs_raw["geometry"] = habs_raw["geom"].apply(lambda x: shape(json.loads(x)))
    hazards_raw["geometry"] = hazards_raw["geom"].apply(lambda x: shape(json.loads(x)))
    if not sites_raw.empty:
        sites_raw["geometry"] = sites_raw["geom"].apply(lambda x: shape(json.loads(x)))

    habs = gpd.GeoDataFrame(habs_raw, geometry="geometry")
    hazards = gpd.GeoDataFrame(hazards_raw, geometry="geometry")
    sites = gpd.GeoDataFrame(sites_raw, geometry="geometry") if not sites_raw.empty else gpd.GeoDataFrame()

    # 2. Multi-Hazard Live Fusion Engine: spatial intersection
    intersections = gpd.overlay(habs, hazards, how="intersection")

    # Calculate hazard score based on cumulative intensity
    if not intersections.empty:
        id_col = "id_1" if "id_1" in intersections.columns else "id"
        hazard_scores = intersections.groupby(id_col)["intensity"].sum().reset_index()
        hazard_scores.rename(columns={id_col: "habitation_id", "intensity": "hazard_score"}, inplace=True)
    else:
        hazard_scores = pd.DataFrame(columns=["habitation_id", "hazard_score"])

    # 3. Socio-Demographic Vulnerability Index
    def calc_vuln(row):
        score = 0
        if row.get("elderly_pct", 0) > 15:
            score += 2
        if row.get("disabled_pct", 0) > 5:
            score += 2
        if row.get("housing_quality") == "Kutcha":
            score += 3
        elif row.get("housing_quality") == "Semi-Pucca":
            score += 1.5
        if row.get("income_bracket") == "Low":
            score += 3
        return max(score, 1)

    habs["vulnerability_score"] = habs.apply(calc_vuln, axis=1)

    # 4. Priority Score Engine
    results = pd.merge(habs, hazard_scores, left_on="id", right_on="habitation_id", how="left")
    results["hazard_score"] = results["hazard_score"].fillna(0)

    # Exposure = Population
    results["exposure_score"] = results["population"]

    # Priority Score = Hazard Intensity x (Exposure / 100) x Vulnerability Factor
    results["priority_score"] = results["hazard_score"] * (results["exposure_score"] / 100.0) * results["vulnerability_score"]

    # Prioritize habitations with non-zero risk (or at least all habitations for demo clarity)
    red_zones_df = results[results["priority_score"] > 0].copy()
    if red_zones_df.empty:
        # Fallback to general habitations with synthetic baseline risk
        red_zones_df = results.copy()
        red_zones_df["priority_score"] = (red_zones_df["exposure_score"] / 100.0) * red_zones_df["vulnerability_score"] * 10.0

    red_zones_df = red_zones_df.sort_values(by="priority_score", ascending=False)

    # Clear existing red zones, certificates, feedback
    db.query(models.Feedback).delete()
    db.query(models.LegalCertificate).delete()
    db.query(models.RedZone).delete()
    db.commit()

    # 5. Phased Action Routing, XAI Explanation & Carrying Capacity
    site_capacities = dict(zip(sites["id"], sites["max_capacity"])) if not sites.empty else {}
    new_red_zones = []

    for _, row in red_zones_df.iterrows():
        score = float(row["priority_score"])
        if score > 500:
            phase = "Immediate"
        elif score > 200:
            phase = "Short-Term"
        else:
            phase = "Medium-Term"

        pop = int(row["population"])
        explanation = (
            f"Zone #{row['id']} prioritized ({phase} phase) due to Hazard Score {float(row['hazard_score']):.1f}, "
            f"Vulnerability Index {float(row['vulnerability_score']):.1f}/10, and Exposed Population {pop}."
        )

        assigned_site = None
        for site_id, cap in site_capacities.items():
            if cap >= pop:
                assigned_site = site_id
                site_capacities[site_id] -= pop
                break

        if assigned_site is not None:
            explanation += f" Assigned to Candidate Safe Camp #{assigned_site}."
        else:
            explanation += " WARNING: Candidate safe sites at full carrying capacity; designated for overflow evacuation."

        rz = models.RedZone(
            habitation_id=int(row["id"]),
            hazard_score=float(row["hazard_score"]),
            vulnerability_score=float(row["vulnerability_score"]),
            exposure_score=float(row["exposure_score"]),
            priority_score=round(score, 1),
            phase=phase,
            xai_explanation=explanation,
            assigned_site_id=int(assigned_site) if assigned_site else None,
        )
        new_red_zones.append(rz)

    db.bulk_save_objects(new_red_zones)
    db.commit()

    log.info("Relocation Analytics Engine ran successfully: %d zones prioritized", len(new_red_zones))
    return {
        "status": "success",
        "zones_processed": len(new_red_zones),
        "message": f"Processed {len(new_red_zones)} habitations into relocation priority phases",
    }
