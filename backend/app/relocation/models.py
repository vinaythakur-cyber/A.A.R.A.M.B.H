from __future__ import annotations

from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, func, Text
from sqlalchemy.orm import relationship
from .database import Base


class HazardZone(Base):
    __tablename__ = "hazard_zones"
    id = Column(Integer, primary_key=True, index=True)
    hazard_type = Column(String(50), nullable=False)
    intensity = Column(Integer)
    historical_casualties = Column(Integer, default=0)
    geom = Column(Text)  # GeoJSON string


class Habitation(Base):
    __tablename__ = "habitations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    population = Column(Integer, nullable=False)
    elderly_pct = Column(Float)
    disabled_pct = Column(Float)
    income_bracket = Column(String(50))
    housing_quality = Column(String(50))
    occupation_type = Column(String(50))
    dependency_ratio = Column(Float)
    geom = Column(Text)  # GeoJSON string

    red_zones = relationship("RedZone", back_populates="habitation")


class CandidateSite(Base):
    __tablename__ = "candidate_sites"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    max_capacity = Column(Integer, nullable=False)
    water_availability = Column(Boolean)
    power_availability = Column(Boolean)
    sanitation = Column(Boolean)
    proximity_to_services = Column(Float)
    geom = Column(Text)  # GeoJSON string

    red_zones = relationship("RedZone", back_populates="assigned_site")


class RedZone(Base):
    __tablename__ = "red_zones"
    id = Column(Integer, primary_key=True, index=True)
    habitation_id = Column(Integer, ForeignKey("habitations.id"))
    hazard_score = Column(Float)
    vulnerability_score = Column(Float)
    exposure_score = Column(Float)
    priority_score = Column(Float)
    phase = Column(String(20))  # Immediate, Short-Term, Medium-Term
    xai_explanation = Column(Text)
    assigned_site_id = Column(Integer, ForeignKey("candidate_sites.id"), nullable=True)

    habitation = relationship("Habitation", back_populates="red_zones")
    assigned_site = relationship("CandidateSite", back_populates="red_zones")
    feedbacks = relationship("Feedback", back_populates="red_zone")
    certificates = relationship("LegalCertificate", back_populates="red_zone")


class Feedback(Base):
    __tablename__ = "feedback"
    id = Column(Integer, primary_key=True, index=True)
    red_zone_id = Column(Integer, ForeignKey("red_zones.id"))
    citizen_name = Column(String(100))
    message = Column(Text)
    timestamp = Column(DateTime, default=func.now())

    red_zone = relationship("RedZone", back_populates="feedbacks")


class LegalCertificate(Base):
    __tablename__ = "legal_certificates"
    id = Column(Integer, primary_key=True, index=True)
    red_zone_id = Column(Integer, ForeignKey("red_zones.id"))
    pdf_hash = Column(String(256))
    issue_date = Column(DateTime, default=func.now())

    red_zone = relationship("RedZone", back_populates="certificates")
