from __future__ import annotations

import json
import logging
import random
from shapely.geometry import Polygon, mapping
from sqlalchemy.orm import Session
from . import models

log = logging.getLogger(__name__)

BASE_LAT = 30.316
BASE_LNG = 78.032


def generate_polygon(center_lat: float, center_lng: float, size: float = 0.01) -> Polygon:
    return Polygon([
        (center_lng - size, center_lat - size),
        (center_lng + size, center_lat - size),
        (center_lng + size, center_lat + size),
        (center_lng - size, center_lat + size),
    ])


def seed_if_empty(db: Session) -> None:
    hab_count = db.query(models.Habitation).count()
    if hab_count > 0:
        log.info("Relocation DB already has %d habitations; skipping seed", hab_count)
        return

    log.info("Seeding initial relocation & hazard data...")

    # Hazards
    hazards = []
    hazard_types = ["Landslide", "Flash Flood", "Slope Erosion", "Cloudburst Outwash", "Debris Flow"]
    for i in range(6):
        lat = BASE_LAT + random.uniform(-0.08, 0.08)
        lng = BASE_LNG + random.uniform(-0.08, 0.08)
        geom = json.dumps(mapping(generate_polygon(lat, lng, random.uniform(0.015, 0.035))))
        hazards.append(models.HazardZone(
            hazard_type=hazard_types[i % len(hazard_types)],
            intensity=random.randint(6, 10),
            historical_casualties=random.randint(0, 45),
            geom=geom,
        ))
    db.bulk_save_objects(hazards)

    # Habitations
    villages = [
        "Rishikesh Valley Hamlet", "Tapovan Riverside", "Shivpuri Ridge",
        "Devprayag Confluence", "Byasi Terraces", "Kaudiyala Bend",
        "Maletha Sector A", "Srinagar Lowlands", "Kirtinagar Colony",
        "Rudraprayag Spur", "Guptkashi Slope", "Ukhimath Ward",
        "Joshimath Terraces", "Chamoli Bluff", "Gopeshwar Foothill",
    ]
    habs = []
    for i, vname in enumerate(villages):
        lat = BASE_LAT + random.uniform(-0.09, 0.09)
        lng = BASE_LNG + random.uniform(-0.09, 0.09)
        geom = json.dumps(mapping(generate_polygon(lat, lng, 0.006)))
        habs.append(models.Habitation(
            name=vname,
            population=random.randint(250, 1400),
            elderly_pct=round(random.uniform(8.0, 28.0), 1),
            disabled_pct=round(random.uniform(2.0, 9.0), 1),
            income_bracket=random.choice(["Low", "Low", "Medium", "High"]),
            housing_quality=random.choice(["Kutcha", "Kutcha", "Semi-Pucca", "Pucca"]),
            occupation_type=random.choice(["Agriculture", "Labor", "Tourism", "Service"]),
            dependency_ratio=round(random.uniform(0.35, 0.75), 2),
            geom=geom,
        ))
    db.bulk_save_objects(habs)

    # Candidate Sites
    sites = [
        ("Doiwala Relief Township", 3200),
        ("Bhaniawala Transit Camp", 2400),
        ("Raiwala Emergency Shelter", 2800),
    ]
    candidate_objs = []
    for sname, cap in sites:
        lat = BASE_LAT + random.uniform(-0.14, 0.14)
        lng = BASE_LNG + random.uniform(-0.14, 0.14)
        geom = json.dumps(mapping(generate_polygon(lat, lng, 0.022)))
        candidate_objs.append(models.CandidateSite(
            name=sname,
            max_capacity=cap,
            water_availability=True,
            power_availability=True,
            sanitation=random.choice([True, True, False]),
            proximity_to_services=round(random.uniform(2.0, 14.0), 1),
            geom=geom,
        ))
    db.bulk_save_objects(candidate_objs)
    db.commit()
    log.info("Seeding complete: %d habitations, %d hazards, %d candidate sites", len(habs), len(hazards), len(candidate_objs))
