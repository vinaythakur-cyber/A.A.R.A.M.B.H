from __future__ import annotations

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class FeedbackCreate(BaseModel):
    citizen_name: str
    message: str
    red_zone_id: int


class FeedbackResponse(BaseModel):
    id: int
    citizen_name: str
    message: str
    red_zone_id: int
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class RedZoneResponse(BaseModel):
    id: int
    habitation_id: int
    hazard_score: float
    vulnerability_score: float
    exposure_score: float
    priority_score: float
    phase: str
    xai_explanation: Optional[str] = None
    assigned_site_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class EngineComputeResponse(BaseModel):
    status: str
    zones_processed: int
    message: Optional[str] = None
