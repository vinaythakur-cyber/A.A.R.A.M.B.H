from __future__ import annotations

import json
from typing import List
from sqlalchemy.orm import Session
from . import models, schemas


def get_red_zones(db: Session) -> List[models.RedZone]:
    return db.query(models.RedZone).all()


def create_feedback(db: Session, feedback: schemas.FeedbackCreate) -> models.Feedback:
    db_feedback = models.Feedback(
        red_zone_id=feedback.red_zone_id,
        citizen_name=feedback.citizen_name,
        message=feedback.message,
    )
    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)
    return db_feedback


def get_hazard_zones_geojson(db: Session) -> dict:
    zones = db.query(models.HazardZone).all()
    features = []
    for row in zones:
        try:
            geom = json.loads(row.geom)
        except Exception:
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "id": row.id,
                "hazard_type": row.hazard_type,
                "intensity": row.intensity,
                "historical_casualties": row.historical_casualties,
            },
            "geometry": geom,
        })
    return {"type": "FeatureCollection", "features": features}


def get_habitations_geojson(db: Session) -> dict:
    habs = db.query(models.Habitation).all()
    features = []
    for row in habs:
        try:
            geom = json.loads(row.geom)
        except Exception:
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "id": row.id,
                "name": row.name,
                "population": row.population,
                "elderly_pct": row.elderly_pct,
                "disabled_pct": row.disabled_pct,
                "income_bracket": row.income_bracket,
                "housing_quality": row.housing_quality,
                "occupation_type": row.occupation_type,
                "dependency_ratio": row.dependency_ratio,
            },
            "geometry": geom,
        })
    return {"type": "FeatureCollection", "features": features}


def get_candidate_sites_geojson(db: Session) -> dict:
    sites = db.query(models.CandidateSite).all()
    features = []
    for row in sites:
        try:
            geom = json.loads(row.geom)
        except Exception:
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "id": row.id,
                "name": row.name,
                "max_capacity": row.max_capacity,
                "water_availability": row.water_availability,
                "power_availability": row.power_availability,
                "sanitation": row.sanitation,
                "proximity_to_services": row.proximity_to_services,
            },
            "geometry": geom,
        })
    return {"type": "FeatureCollection", "features": features}
