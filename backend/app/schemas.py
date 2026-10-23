"""Pydantic request/response models and the LangGraph TripState."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional, TypedDict

from pydantic import BaseModel, Field, model_validator

Theme = Literal["balanced", "foodie", "heritage", "nature", "religious"]


# --------------------------------------------------------------------------- #
# API request / response models
# --------------------------------------------------------------------------- #
class TripRequest(BaseModel):
    start: str = Field(..., examples=["Ghaziabad"])
    destination: str = Field(..., examples=["Etawah"])
    departure: Optional[datetime] = Field(
        None, description="ISO datetime of departure; defaults to now."
    )
    detour_budget_min: int = Field(45, ge=0, le=300)
    themes: list[Theme] = Field(default_factory=lambda: ["balanced"])

    @model_validator(mode="before")
    @classmethod
    def _coerce_themes(cls, data):
        """Accept legacy single `theme`, and never allow an empty themes list."""
        if isinstance(data, dict):
            if "themes" not in data and data.get("theme"):
                data = {**data, "themes": [data["theme"]]}
        return data

    @model_validator(mode="after")
    def _default_theme(self):
        if not self.themes:
            self.themes = ["balanced"]
        return self

    @property
    def themes_key(self) -> str:
        """Stable, order-independent key fragment for caching."""
        return ",".join(sorted(set(self.themes)))


class LatLon(BaseModel):
    lat: float
    lon: float


class Waypoint(BaseModel):
    point: LatLon
    dist_from_start_km: float
    eta: Optional[datetime] = None


class Place(BaseModel):
    xid: str
    name: str
    kinds: str = ""
    point: LatLon
    rate: int = 0
    dist_to_route_km: float = 0.0
    nearest_waypoint_km: float = 0.0  # distance-from-start of nearest waypoint
    wikidata: Optional[str] = None
    photo_ref: Optional[str] = None  # provider photo reference (Google), if any
    photo_url: Optional[str] = None  # direct image URL (OTM preview / Wikipedia)


class RankedPlace(Place):
    score: float = 0.0
    eta: Optional[datetime] = None
    why: str = ""  # short reason, filled by narrator


class Itinerary(BaseModel):
    intro: str = ""
    stops: list[RankedPlace] = Field(default_factory=list)
    narrative_markdown: str = ""


class Suggestion(BaseModel):
    label: str
    lat: Optional[float] = None
    lon: Optional[float] = None


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)


class AskResponse(BaseModel):
    answer: str


class TripResponse(BaseModel):
    trip_id: str
    request: TripRequest
    start_point: LatLon
    end_point: LatLon
    total_distance_km: float
    total_duration_min: float
    waypoint_count: int
    raw_place_count: int
    polyline: list[LatLon] = Field(default_factory=list)  # route geometry for the map
    itinerary: Itinerary
    warnings: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# LangGraph shared state
# --------------------------------------------------------------------------- #
class TripState(TypedDict, total=False):
    # inputs
    request: TripRequest
    # route
    start_point: LatLon
    end_point: LatLon
    polyline: list[tuple[float, float]]  # (lat, lon)
    total_distance_km: float
    total_duration_min: float
    # sampling
    waypoints: list[Waypoint]
    # discovery
    raw_places: list[Place]
    # ranking
    ranked_places: list[RankedPlace]
    # narration
    itinerary: Itinerary
    # diagnostics
    warnings: list[str]
