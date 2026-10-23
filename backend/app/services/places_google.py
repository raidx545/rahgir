"""Google Places API (New) provider — Nearby Search.

Drop-in for otm.pois_near: same signature, returns list[Place]. Richer coverage
for tier-2/3 India (addresses PRD §12), but PAID per request — the Redis cache
is what keeps that affordable, so identical waypoints/routes cost nothing after
the first call.

Docs: https://developers.google.com/maps/documentation/places/web-service/nearby-search
"""
from __future__ import annotations

import math

import httpx

from ..cache import cache, make_key
from ..config import settings
from ..kinds import google_types_for
from ..schemas import LatLon, Place

SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby"
TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"

# Travel-relevant categories, so we don't pay for gas stations / ATMs etc.
# NOTE: these must all be valid Nearby Search (New) "Table A" includedTypes —
# generic categories like "place_of_worship" or "monument" are NOT allowed.
INCLUDED_TYPES = [
    "tourist_attraction", "historical_landmark",
    "hindu_temple", "church", "mosque",
    "museum", "art_gallery",
    "park", "national_park",
    "restaurant", "cafe", "market",
]

# Basic id/location/types + rating/photos. Note: rating & photos push this into
# a higher billing SKU — trim if cost matters more than richness.
FIELD_MASK_BASE = (
    "places.id,places.displayName,places.location,places.types,"
    "places.primaryType,places.rating,places.userRatingCount"
)


class GooglePlacesError(RuntimeError):
    pass


class GoogleQuotaError(GooglePlacesError):
    """Daily Google spend cap reached."""


async def _guard() -> None:
    """Enforce the daily Google call budget before every billable request."""
    if not await cache.incr_daily("google", settings.google_daily_cap):
        raise GoogleQuotaError(
            "Daily Google Places budget reached. Try again tomorrow or raise "
            "GOOGLE_DAILY_CAP."
        )


def _rate_from(rating: float | None, count: int | None) -> int:
    """Map Google rating (0-5) + review count into our 0-3 importance scale."""
    if not rating or not count:
        return 0
    confidence = min(1.0, math.log10(count + 1) / 3.0)  # ~1.0 near 1000 reviews
    score = (rating / 5.0) * 3.0 * (0.5 + 0.5 * confidence)
    return max(0, min(3, round(score)))


async def pois_near(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    radius_m: int | None = None,
    limit: int | None = None,
    min_rate: int | None = None,  # accepted for signature parity; unused
    themes: list[str] | None = None,
) -> list[Place]:
    """Return travel-relevant POIs near (lat, lon), sorted by popularity. Cached.

    When themes are given, the search is narrowed to those categories — more
    relevant results AND fewer/cheaper calls than the broad default set.
    """
    radius_m = min(radius_m or settings.poi_radius_m, 50000)  # Google max 50 km
    limit = min(limit or settings.poi_per_waypoint, 20)  # Google max 20
    types = google_types_for(themes or []) or INCLUDED_TYPES
    key = make_key("gplaces", round(lat, 3), round(lon, 3), radius_m, limit,
                   settings.poi_photos, ",".join(types))

    async def _fetch() -> list[dict]:
        settings.require("google_places_api_key")
        await _guard()
        field_mask = FIELD_MASK_BASE + (",places.photos" if settings.poi_photos else "")
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": settings.google_places_api_key,
            "X-Goog-FieldMask": field_mask,
        }
        base_body = {
            "maxResultCount": limit,
            "rankPreference": "POPULARITY",
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": lat, "longitude": lon},
                    "radius": float(radius_m),
                }
            },
        }

        async def _call(with_types: bool, included=types):
            body = {**base_body, "includedTypes": included} if with_types else base_body
            try:
                return await client.post(SEARCH_URL, json=body, headers=headers,
                                         timeout=settings.request_timeout_s)
            except httpx.HTTPError as e:
                raise GooglePlacesError(f"Could not reach Google Places: {e}") from e

        r = await _call(with_types=True)
        # If Google rejects an includedType, retry unfiltered so the trip still works.
        if r.status_code == 400 and "Unsupported types" in r.text:
            r = await _call(with_types=False)
        if r.status_code in (401, 403):
            raise GooglePlacesError(
                "Google Places rejected the key (check GOOGLE_PLACES_API_KEY, "
                "billing, and API restrictions)."
            )
        if r.status_code != 200:
            raise GooglePlacesError(f"Google Places search failed (HTTP {r.status_code}): {r.text[:200]}")
        try:
            payload = r.json()
        except ValueError as e:
            raise GooglePlacesError("Google Places returned a non-JSON response.") from e

        places: list[dict] = []
        for item in payload.get("places", []):
            name = ((item.get("displayName") or {}).get("text") or "").strip()
            loc = item.get("location") or {}
            if not name or "latitude" not in loc:
                continue
            place_types = item.get("types") or ([item["primaryType"]] if item.get("primaryType") else [])
            photos = item.get("photos") or []
            photo_ref = photos[0].get("name") if photos else None
            places.append(
                Place(
                    xid=item.get("id", ""),
                    name=name,
                    kinds=",".join(place_types),
                    point=LatLon(lat=loc["latitude"], lon=loc["longitude"]),
                    rate=_rate_from(item.get("rating"), item.get("userRatingCount")),
                    photo_ref=photo_ref,
                ).model_dump()
            )
        return places

    data = await cache.cached_json(key, settings.ttl_pois_s, _fetch)
    return [Place(**d) for d in data]


async def geocode(client: httpx.AsyncClient, text: str) -> tuple[float, float, str]:
    """Resolve a place name to (lat, lon, label) via Google Text Search. Cached."""
    key = make_key("gtext", text.strip().lower())

    async def _fetch() -> list:
        settings.require("google_places_api_key")
        await _guard()
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": settings.google_places_api_key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.location",
        }
        body = {"textQuery": text, "regionCode": "IN", "maxResultCount": 1}
        try:
            r = await client.post(TEXT_SEARCH_URL, json=body, headers=headers,
                                  timeout=settings.request_timeout_s)
        except httpx.HTTPError as e:
            raise GooglePlacesError(f"Could not reach Google Places: {e}") from e
        if r.status_code in (401, 403):
            raise GooglePlacesError("Google Places rejected the key (check GOOGLE_PLACES_API_KEY / billing).")
        if r.status_code != 200:
            raise GooglePlacesError(f"Geocoding failed (HTTP {r.status_code}): {r.text[:200]}")
        places = (r.json().get("places") or [])
        if not places:
            raise GooglePlacesError(f"Could not find '{text}'. Try a nearby larger town.")
        p = places[0]
        loc = p.get("location") or {}
        label = (p.get("displayName") or {}).get("text", text)
        return [loc.get("latitude"), loc.get("longitude"), label]

    data = await cache.cached_json(key, settings.ttl_geocode_s, _fetch)
    if data[0] is None or data[1] is None:
        raise GooglePlacesError(f"Could not find '{text}'.")
    return data[0], data[1], data[2]


async def autocomplete(client: httpx.AsyncClient, text: str) -> list[dict]:
    """Place-name suggestions via Google Places Autocomplete (New). Cached.

    Autocomplete does not return coordinates (that needs a Place Details call),
    so lat/lon are omitted — the trip flow geocodes the chosen name anyway.
    """
    text = (text or "").strip()
    if len(text) < 2:
        return []
    key = make_key("gauto", text.lower())

    async def _fetch() -> list[dict]:
        settings.require("google_places_api_key")
        await _guard()
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": settings.google_places_api_key,
        }
        body = {"input": text, "includedRegionCodes": ["in"]}
        try:
            r = await client.post(AUTOCOMPLETE_URL, json=body, headers=headers,
                                  timeout=settings.request_timeout_s)
        except httpx.HTTPError as e:
            raise GooglePlacesError(f"Autocomplete unavailable: {e}") from e
        if r.status_code in (401, 403):
            raise GooglePlacesError("Google Places rejected the key (check GOOGLE_PLACES_API_KEY).")
        if r.status_code != 200:
            raise GooglePlacesError(f"Autocomplete failed (HTTP {r.status_code}).")
        out: list[dict] = []
        seen: set[str] = set()
        for s in (r.json().get("suggestions") or []):
            pred = s.get("placePrediction") or {}
            label = (pred.get("text") or {}).get("text")
            if not label or label in seen:
                continue
            seen.add(label)
            out.append({"label": label, "lat": None, "lon": None})
        return out

    return await cache.cached_json(key, settings.ttl_geocode_s, _fetch)
