"""places_node: fan-out POI discovery per waypoint, then dedupe."""
from __future__ import annotations

import asyncio

import httpx

from ..geometry import haversine_km, min_dist_to_polyline_km
from ..schemas import Place, TripState
from ..services import places as poi_provider


async def places_node(state: TripState, client: httpx.AsyncClient) -> TripState:
    waypoints = state["waypoints"]
    polyline = state["polyline"]
    themes = state["request"].themes
    warnings = list(state.get("warnings", []))

    # Fan out one POI query per waypoint, concurrently. A failure on a single
    # waypoint (provider error) degrades to no POIs there rather than failing
    # the whole trip. Both providers raise RuntimeError subclasses.
    async def fetch(wp):
        try:
            return await poi_provider.pois_near(
                client, wp.point.lat, wp.point.lon, themes=themes
            )
        except RuntimeError as e:
            warnings.append(str(e))
            return []

    results = await asyncio.gather(*(fetch(wp) for wp in waypoints))

    # Dedupe by xid (fall back to name+coords), keep highest rate.
    by_key: dict[str, Place] = {}
    for places in results:
        for p in places:
            key = p.xid or f"{p.name}:{p.point.lat:.4f}:{p.point.lon:.4f}"
            if key not in by_key or p.rate > by_key[key].rate:
                by_key[key] = p

    # Annotate each place with distance-to-route and nearest-waypoint distance.
    deduped: list[Place] = []
    for p in by_key.values():
        p.dist_to_route_km = round(
            min_dist_to_polyline_km(p.point.lat, p.point.lon, polyline), 2
        )
        nearest = min(
            waypoints,
            key=lambda w: haversine_km(p.point.lat, p.point.lon, w.point.lat, w.point.lon),
        )
        p.nearest_waypoint_km = nearest.dist_from_start_km
        deduped.append(p)

    if not deduped:
        warnings.append(
            "No named POIs found along this route. POI coverage is sparse for many "
            "tier-2/3 towns; the famous-for agent (future) will fill this gap."
        )

    return {"raw_places": deduped, "warnings": warnings}
