"""Pydantic response models matching the ARCHITECTURE.md API contract."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    last_cycle: Optional[str] = None
    mode: str = "live"


class RadarResponse(BaseModel):
    bounds: list[list[float]]
    grid: list[list[float]]  # 96x96 dBZ
    resolution_km: float = 1.0
    valid_time: Optional[str] = None


class DistrictRow(BaseModel):
    district: str
    hazard: str
    severity: str
    arrival_minutes: int
    probability: float
    advisory: str
    advisory_hi: str = ""


class CycleResponse(BaseModel):
    cycle_id: int
    valid_time: Optional[str] = None
    next_cycle_in_s: int
    hazard_counts: dict[str, int] = Field(default_factory=dict)


class LiveEvent(BaseModel):
    event: str = "new_cycle"
    cycle_id: int
    valid_time: Optional[str] = None
    counts: dict[str, int] = Field(default_factory=dict)


# GeoJSON shapes (kept loose; polygons.py builds the exact required properties)
class FeatureProperties(BaseModel):
    hazard: str
    severity: str
    probability: float
    intensity: str
    lead_minutes: int
    valid_time: Optional[str] = None
    cell_id: str
    eta_minutes: int
    advisory: str
    advisory_hi: str = ""


class Feature(BaseModel):
    type: str = "Feature"
    geometry: dict[str, Any]
    properties: FeatureProperties


class FeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[Feature] = Field(default_factory=list)
