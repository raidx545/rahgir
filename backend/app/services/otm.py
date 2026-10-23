"""OpenTripMap client: POI discovery around a point."""
from __future__ import annotations

import httpx

from ..cache import cache, make_key
from ..config import settings
from ..schemas import LatLon, Place

BASE = "https://api.opentripmap.com/0.1/en/places"


class OTMError(RuntimeError):
    pass


async def pois_near(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    radius_m: int | None = None,
    limit: int | None = None,
    min_rate: int | None = None,
) -> list[Place]:
    """Return named POIs within radius of (lat, lon), sorted by importance. Cached."""
    radius_m = radius_m or settings.poi_radius_m
    limit = limit or settings.poi_per_waypoint
    min_rate = settings.poi_min_rate if min_rate is None else min_rate
    # round coords so nearby waypoints on popular routes share cache entries
    key = make_key("pois", round(lat, 3), round(lon, 3), radius_m, min_rate, limit)

    async def _fetch() -> list[dict]:
        settings.require("otm_api_key")
        params = {
            "radius": radius_m,
            "lon": lon,
            "lat": lat,
            "rate": min_rate,
            "format": "json",
            "limit": limit,
            "apikey": settings.otm_api_key,
        }
        try:
            r = await client.get(f"{BASE}/radius", params=params, timeout=settings.request_timeout_s)
        except httpx.HTTPError as e:
            raise OTMError(f"Could not reach OpenTripMap: {e}") from e
        if r.status_code in (401, 403):
            raise OTMError("OpenTripMap rejected the key (check OTM_API_KEY).")
        if r.status_code != 200:
            raise OTMError(f"POI search failed (HTTP {r.status_code}).")
        try:
            items = r.json()
        except ValueError as e:
            raise OTMError("OpenTripMap returned a non-JSON response.") from e

        places: list[dict] = []
        for item in items:
            name = (item.get("name") or "").strip()
            if not name:
                continue
            pt = item.get("point") or {}
            rate = item.get("rate")
            try:
                rate = int(rate)
            except (TypeError, ValueError):
                rate = 0
            places.append(
                Place(
                    xid=item.get("xid", ""),
                    name=name,
                    kinds=item.get("kinds", ""),
                    point=LatLon(lat=pt.get("lat", lat), lon=pt.get("lon", lon)),
                    rate=rate,
                    wikidata=item.get("wikidata"),
                ).model_dump()
            )
        return places

    data = await cache.cached_json(key, settings.ttl_pois_s, _fetch)
    return [Place(**d) for d in data]


async def preview_image(client: httpx.AsyncClient, xid: str) -> str | None:
    """Fetch an OpenTripMap POI's preview image URL (via xid detail). Cached."""
    if not xid:
        return None
    key = make_key("otmphoto", xid)

    async def _fetch() -> dict:
        settings.require("otm_api_key")
        try:
            r = await client.get(
                f"{BASE}/xid/{xid}",
                params={"apikey": settings.otm_api_key},
                timeout=settings.request_timeout_s,
            )
        except httpx.HTTPError:
            return {"url": None}
        if r.status_code != 200:
            return {"url": None}
        try:
            d = r.json()
        except ValueError:
            return {"url": None}
        preview = d.get("preview") or {}
        return {"url": preview.get("source") or None}

    data = await cache.cached_json(key, settings.ttl_pois_s, _fetch)
    return data.get("url")
