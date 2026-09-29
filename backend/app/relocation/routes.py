from __future__ import annotations

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from . import crud, engine, models, pdf_gen, schemas
from .database import get_db

router = APIRouter(tags=["Disaster Relocation & AI-GIS"])


@router.get("/api/layers/hazards")
def get_hazards(db: Session = Depends(get_db)):
    """GeoJSON polygons of multi-hazard zones (landslide, flood, cloudburst outwash)."""
    return crud.get_hazard_zones_geojson(db)


@router.get("/api/layers/habitations")
def get_habitations(db: Session = Depends(get_db)):
    """GeoJSON of habitations with socio-demographic vulnerability metadata."""
    return crud.get_habitations_geojson(db)


@router.get("/api/layers/candidate-sites")
def get_candidate_sites(db: Session = Depends(get_db)):
    """GeoJSON polygons of candidate safe relocation sites with carrying capacity."""
    return crud.get_candidate_sites_geojson(db)


@router.post("/api/engine/compute", response_model=schemas.EngineComputeResponse)
def compute_red_zones(db: Session = Depends(get_db)):
    """Trigger the AI-GIS spatial fusion & carrying capacity allocation engine."""
    result = engine.run_analytics_engine(db)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.get("/api/red-zones", response_model=List[schemas.RedZoneResponse])
def get_red_zones(db: Session = Depends(get_db)):
    """List prioritized habitations classified into Immediate, Short-Term, and Medium-Term phases."""
    return crud.get_red_zones(db)


@router.post("/api/feedback", response_model=schemas.FeedbackResponse)
def submit_feedback(feedback: schemas.FeedbackCreate, db: Session = Depends(get_db)):
    """Citizen grievance & feedback submission for a prioritized habitation."""
    return crud.create_feedback(db, feedback)


@router.get("/api/red-zones/{zone_id}/certificate")
def get_certificate(zone_id: int, db: Session = Depends(get_db)):
    """Generate and download dynamic PDF Legal Relocation Certificate with SHA-256 audit hash."""
    pdf_bytes = pdf_gen.generate_legal_certificate(db, zone_id)
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="Zone not found or certificate generation failed")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=bhoomirakshak_certificate_zone_{zone_id}.pdf"},
    )
