"""Invoke the FULL graph with mocked external services (no API keys).

This catches runtime wiring bugs (e.g. how LangGraph calls partial-bound
nodes) that the compile-only test cannot.

Run: ./.venv/bin/python -m tests.test_graph_invoke
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx

from app.graph import build_graph
from app.schemas import LatLon, Place, TripRequest, TripState


def _fake_places(client, lat, lon, **kw):
    # two POIs near each queried waypoint
    return [
        Place(xid=f"x{lat:.2f}a", name=f"Fort {lat:.2f}", kinds="historic,fortifications",
              point=LatLon(lat=lat + 0.01, lon=lon + 0.01), rate=3),
        Place(xid=f"x{lat:.2f}b", name=f"Dhaba {lat:.2f}", kinds="foods",
              point=LatLon(lat=lat - 0.01, lon=lon - 0.01), rate=2),
    ]


async def _run():
    from app import config
    config.settings.poi_provider = "otm"  # deterministic regardless of .env
    client = httpx.AsyncClient()
    graph = build_graph(client)

    polyline = [(28.61, 77.20), (28.0, 76.6), (27.5, 76.1), (26.91, 75.78)]

    with patch("app.services.ors.geocode", new=AsyncMock(side_effect=[
                (28.61, 77.20, "Delhi"), (26.91, 75.78, "Jaipur")])), \
         patch("app.services.ors.route", new=AsyncMock(return_value=(polyline, 281.0, 300.0))), \
         patch("app.services.otm.pois_near", new=AsyncMock(side_effect=_fake_places)), \
         patch("app.services.llm.chat_json", new=AsyncMock(return_value={
             "intro": "A fine drive.",
             "stops": [{"name": "Fort 28.61", "why": "Historic hilltop fort."}],
             "narrative_markdown": "### Fort\nNice.",
         })):
        state: TripState = {
            "request": TripRequest(start="Delhi", destination="Jaipur",
                                   departure=datetime(2026, 8, 3, 8, 0, tzinfo=timezone.utc)),
            "warnings": [],
        }
        final = await graph.ainvoke(state)

    await client.aclose()
    return final


def main():
    final = asyncio.run(_run())
    assert final["total_distance_km"] == 281.0, final.get("total_distance_km")
    assert final["waypoints"], "no waypoints"
    assert final["raw_places"], "no raw places"
    assert final["itinerary"].stops, "no ranked stops"
    print("PASS  full graph invoke")
    print(f"      waypoints={len(final['waypoints'])} "
          f"raw_places={len(final['raw_places'])} "
          f"ranked={len(final['itinerary'].stops)} "
          f"intro={final['itinerary'].intro!r}")


if __name__ == "__main__":
    main()
