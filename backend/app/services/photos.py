"""Best-effort image lookup for POIs, so the itinerary cards show photos.

Free sources, no API key:
  1. OpenTripMap preview image (via xid) — handled in otm.preview_image.
  2. Wikipedia REST summary thumbnail (by place name) — here.

Both are cached. Missing images degrade gracefully to an icon on the frontend.
"""
from __future__ import annotations

import httpx

from ..cache import cache, make_key
from ..config import settings

WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"


async def wiki_thumbnail(client: httpx.AsyncClient, name: str) -> str | None:
    """Return a Wikipedia thumbnail URL for a place name, if a page exists. Cached."""
    name = (name or "").strip()
    if not name:
        return None
    key = make_key("wikiphoto", name.lower())

    async def _fetch() -> dict:
        title = name.replace(" ", "_")
        try:
            r = await client.get(
                WIKI_SUMMARY.format(title=title),
                headers={"User-Agent": "Rahgir/0.1 (travel assistant)"},
                timeout=settings.request_timeout_s,
                follow_redirects=True,
            )
        except httpx.HTTPError:
            return {"url": None}
        if r.status_code != 200:
            return {"url": None}
        try:
            d = r.json()
        except ValueError:
            return {"url": None}
        thumb = (d.get("thumbnail") or {}).get("source")
        return {"url": thumb or None}

    data = await cache.cached_json(key, settings.ttl_pois_s, _fetch)
    return data.get("url")
