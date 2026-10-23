"""POI provider dispatch.

Selects the POI source at runtime from POI_PROVIDER ("otm" | "google") so the
rest of the pipeline never knows or cares which backend served the places.
Both providers expose the same async `pois_near(...) -> list[Place]`.
"""
from __future__ import annotations

import asyncio

import httpx

from ..config import settings
from ..schemas import Place
from . import ors, otm, photos, places_google


def provider_name() -> str:
    return "google" if settings.poi_provider.lower() == "google" else "otm"


async def pois_near(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    themes: list[str] | None = None,
    **kwargs,
) -> list[Place]:
    if provider_name() == "google":
        return await places_google.pois_near(client, lat, lon, themes=themes, **kwargs)
    # OpenTripMap has no type filter; themes are applied later in ranking.
    return await otm.pois_near(client, lat, lon, **kwargs)


async def geocode(client: httpx.AsyncClient, text: str):
    """Resolve a place name → (lat, lon, label) using the active provider.

    Google Places can geocode; OpenTripMap cannot, so the OTM path still uses
    OpenRouteService for geocoding.
    """
    if provider_name() == "google":
        return await places_google.geocode(client, text)
    return await ors.geocode(client, text)


async def autocomplete(client: httpx.AsyncClient, text: str) -> list[dict]:
    if provider_name() == "google":
        return await places_google.autocomplete(client, text)
    return await ors.autocomplete(client, text)


async def enrich_photos(client: httpx.AsyncClient, stops: list) -> None:
    """Populate photo_url on the given stops (in place), best-effort.

    Google stops normally carry photo_ref (resolved lazily by the frontend via
    /photo). But Nearby Search only serves `places.photos` on the paid Pro SKU —
    when it is not enabled the field is silently omitted, so we fall back to a
    Wikipedia thumbnail rather than shipping an itinerary with no images.
    For OpenTripMap we use the POI preview image, then Wikipedia.
    All lookups are cached and run concurrently.
    """
    google = provider_name() == "google"

    async def one_google(stop) -> None:
        # Google gave us a photo reference — nothing more to do.
        if getattr(stop, "photo_ref", None) or getattr(stop, "photo_url", None):
            return
        stop.photo_url = await photos.wiki_thumbnail(client, stop.name)

    if google:
        await asyncio.gather(*(one_google(s) for s in stops))
        return

    async def one(stop) -> None:
        if getattr(stop, "photo_url", None):
            return
        url = await otm.preview_image(client, stop.xid)
        if not url:
            url = await photos.wiki_thumbnail(client, stop.name)
        stop.photo_url = url

    await asyncio.gather(*(one(s) for s in stops))
