"""route_node: geocode start/destination and fetch the drivable route."""
from __future__ import annotations

import httpx

from ..schemas import LatLon, TripState
from ..services import ors
from ..services import places as poi_provider


async def route_node(state: TripState, client: httpx.AsyncClient) -> TripState:
    req = state["request"]
    # Geocode via the active POI provider (Google or ORS); routing is ORS-only
    # (Google Places API cannot compute a driving route).
    s_lat, s_lon, _ = await poi_provider.geocode(client, req.start)
    e_lat, e_lon, _ = await poi_provider.geocode(client, req.destination)
    polyline, dist_km, dur_min = await ors.route(client, (s_lat, s_lon), (e_lat, e_lon))
    return {
        "start_point": LatLon(lat=s_lat, lon=s_lon),
        "end_point": LatLon(lat=e_lat, lon=e_lon),
        "polyline": polyline,
        "total_distance_km": round(dist_km, 1),
        "total_duration_min": round(dur_min, 1),
    }
