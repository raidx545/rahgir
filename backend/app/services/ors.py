"""OpenRouteService client: geocoding + drivable route geometry."""
from __future__ import annotations

import httpx

from ..cache import cache, make_key
from ..config import settings

GEOCODE_URL = "https://api.openrouteservice.org/geocode/search"
AUTOCOMPLETE_URL = "https://api.openrouteservice.org/geocode/autocomplete"
DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"


class ORSError(RuntimeError):
    """Any recoverable failure talking to OpenRouteService."""


async def geocode(client: httpx.AsyncClient, text: str) -> tuple[float, float, str]:
    """Return (lat, lon, label) for a place name, biased to India. Cached."""
    key = make_key("geocode", text.strip().lower())

    async def _fetch() -> list:
        settings.require("ors_api_key")
        params = {
            "api_key": settings.ors_api_key,
            "text": text,
            "boundary.country": "IND",
            "size": 1,
        }
        try:
            r = await client.get(GEOCODE_URL, params=params, timeout=settings.request_timeout_s)
        except httpx.HTTPError as e:
            raise ORSError(f"Could not reach the geocoder for '{text}': {e}") from e
        if r.status_code in (401, 403):
            raise ORSError("OpenRouteService rejected the key (check ORS_API_KEY).")
        if r.status_code != 200:
            raise ORSError(f"Geocoding failed for '{text}' (HTTP {r.status_code}).")
        try:
            feats = r.json().get("features") or []
        except ValueError as e:
            raise ORSError("Geocoder returned a non-JSON response.") from e
        if not feats:
            raise ORSError(f"Could not geocode '{text}'. Try a nearby larger town.")
        try:
            lon, lat = feats[0]["geometry"]["coordinates"]
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise ORSError(f"Unexpected geocoder response shape for '{text}'.") from e
        label = feats[0].get("properties", {}).get("label", text)
        return [lat, lon, label]

    data = await cache.cached_json(key, settings.ttl_geocode_s, _fetch)
    return data[0], data[1], data[2]


async def autocomplete(client: httpx.AsyncClient, text: str) -> list[dict]:
    """Return place suggestions [{label, lat, lon}] for a partial name. Cached."""
    text = (text or "").strip()
    if len(text) < 2:
        return []
    key = make_key("autocomplete", text.lower())

    async def _fetch() -> list[dict]:
        settings.require("ors_api_key")
        params = {
            "api_key": settings.ors_api_key,
            "text": text,
            "boundary.country": "IND",
            "size": 6,
        }
        try:
            r = await client.get(
                AUTOCOMPLETE_URL, params=params, timeout=settings.request_timeout_s
            )
        except httpx.HTTPError as e:
            raise ORSError(f"Autocomplete unavailable: {e}") from e
        if r.status_code in (401, 403):
            raise ORSError("OpenRouteService rejected the key (check ORS_API_KEY).")
        if r.status_code != 200:
            raise ORSError(f"Autocomplete failed (HTTP {r.status_code}).")
        try:
            feats = r.json().get("features") or []
        except ValueError as e:
            raise ORSError("Autocomplete returned a non-JSON response.") from e

        out: list[dict] = []
        seen: set[str] = set()
        for f in feats:
            props = f.get("properties") or {}
            label = props.get("label")
            coords = (f.get("geometry") or {}).get("coordinates") or []
            if not label or len(coords) < 2 or label in seen:
                continue
            seen.add(label)
            out.append({"label": label, "lat": coords[1], "lon": coords[0]})
        return out

    return await cache.cached_json(key, settings.ttl_geocode_s, _fetch)


async def route(
    client: httpx.AsyncClient,
    start: tuple[float, float],
    end: tuple[float, float],
) -> tuple[list[tuple[float, float]], float, float]:
    """Fetch a driving route.

    Args are (lat, lon) tuples. Returns:
      (polyline[(lat, lon)...], distance_km, duration_min)
    Cached by rounded endpoints.
    """
    key = make_key("route", round(start[0], 4), round(start[1], 4),
                   round(end[0], 4), round(end[1], 4))

    async def _fetch() -> dict:
        settings.require("ors_api_key")
        body = {
            # ORS expects [lon, lat]
            "coordinates": [[start[1], start[0]], [end[1], end[0]]],
            "instructions": False,
        }
        headers = {"Authorization": settings.ors_api_key, "Content-Type": "application/json"}
        try:
            r = await client.post(
                DIRECTIONS_URL, json=body, headers=headers, timeout=settings.request_timeout_s
            )
        except httpx.HTTPError as e:
            raise ORSError(f"Could not reach the routing service: {e}") from e
        if r.status_code in (401, 403):
            raise ORSError("OpenRouteService rejected the key (check ORS_API_KEY).")
        if r.status_code != 200:
            raise ORSError(f"Routing failed (HTTP {r.status_code}): {r.text[:200]}")
        try:
            data = r.json()
            feats = data.get("features") or []
            if not feats:
                raise ORSError("No drivable route found between those points.")
            coords = feats[0]["geometry"]["coordinates"]  # [[lon, lat], ...]
            summary = feats[0]["properties"]["summary"]
        except ORSError:
            raise
        except (ValueError, KeyError, IndexError, TypeError) as e:
            raise ORSError("Unexpected routing response shape from OpenRouteService.") from e
        polyline = [[lat, lon] for lon, lat in coords]
        if not polyline:
            raise ORSError("Route came back empty.")
        return {
            "polyline": polyline,
            "dist": summary.get("distance", 0) / 1000.0,
            "dur": summary.get("duration", 0) / 60.0,
        }

    data = await cache.cached_json(key, settings.ttl_route_s, _fetch)
    polyline = [(p[0], p[1]) for p in data["polyline"]]
    return polyline, data["dist"], data["dur"]
