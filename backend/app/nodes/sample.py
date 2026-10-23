"""sample_node: turn the polyline into waypoints with ETAs."""
from __future__ import annotations

from datetime import datetime, timezone

from ..config import settings
from ..geometry import eta_at, sample_polyline
from ..schemas import LatLon, TripState, Waypoint


def sample_node(state: TripState) -> TripState:
    req = state["request"]
    polyline = state["polyline"]
    total_km = state["total_distance_km"]
    total_min = state["total_duration_min"]
    departure = req.departure or datetime.now(timezone.utc)

    samples = sample_polyline(polyline, settings.sample_km)
    waypoints = [
        Waypoint(
            point=LatLon(lat=lat, lon=lon),
            dist_from_start_km=round(dist, 1),
            eta=eta_at(departure, total_min, dist, total_km),
        )
        for (lat, lon), dist in samples
    ]
    return {"waypoints": waypoints}
