"""Endpoint-level tests via the ASGI app with mocked external services.

Proves: happy path 200, full-trip caching, and that an UNEXPECTED error is
returned as a clean 502 (never an opaque 500).

Run: ./.venv/bin/python -m tests.test_api
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app import config
from app.schemas import LatLon, Place

BODY = {
    "start": "Delhi",
    "destination": "Jaipur",
    "departure": "2026-08-03T08:00:00+00:00",
    "detour_budget_min": 120,
    "theme": "heritage",
}

POLYLINE = [(28.61, 77.20), (28.0, 76.6), (27.5, 76.1), (26.91, 75.78)]


def _places(client, lat, lon, **kw):
    return [
        Place(xid=f"x{lat:.2f}", name=f"Fort {lat:.2f}", kinds="historic",
              point=LatLon(lat=lat, lon=lon), rate=3),
    ]


def _set_keys():
    config.settings.poi_provider = "otm"  # deterministic regardless of .env
    config.settings.ors_api_key = "test"
    config.settings.otm_api_key = "test"
    config.settings.openrouter_api_key = "test"


def test_happy_path_and_cache():
    _set_keys()
    calls = {"route": 0}

    async def route_mock(*a, **k):
        calls["route"] += 1
        return (POLYLINE, 281.0, 300.0)

    with patch("app.services.ors.geocode", new=AsyncMock(side_effect=[
                (28.61, 77.20, "Delhi"), (26.91, 75.78, "Jaipur"),
                (28.61, 77.20, "Delhi"), (26.91, 75.78, "Jaipur")])), \
         patch("app.services.ors.route", new=route_mock), \
         patch("app.services.otm.pois_near", new=AsyncMock(side_effect=_places)), \
         patch("app.services.llm.chat_json", new=AsyncMock(return_value={
             "intro": "Go.", "stops": [], "narrative_markdown": ""})):
        with TestClient(app_fresh()) as c:
            r1 = c.post("/trip", json=BODY)
            assert r1.status_code == 200, r1.text
            trip_id = r1.json()["trip_id"]
            assert r1.json()["total_distance_km"] == 281.0

            # GET by id works
            r_get = c.get(f"/trip/{trip_id}")
            assert r_get.status_code == 200, r_get.text

            # identical request → full-trip cache HIT (route not called again)
            calls["route"] = 0
            r2 = c.post("/trip", json=BODY)
            assert r2.status_code == 200
            assert calls["route"] == 0, "expected trip cache hit (no route call)"
    print("PASS  happy path + cache (GET ok, 2nd POST cached)")


def test_unexpected_error_is_clean_502():
    _set_keys()
    with patch("app.services.ors.geocode", new=AsyncMock(side_effect=[
                (28.61, 77.20, "Delhi"), (26.91, 75.78, "Jaipur")])), \
         patch("app.services.ors.route", new=AsyncMock(return_value=(POLYLINE, 281.0, 300.0))), \
         patch("app.services.otm.pois_near", new=AsyncMock(side_effect=KeyError("boom"))):
        with TestClient(app_fresh(), raise_server_exceptions=False) as c:
            r = c.post("/trip", json={**BODY, "departure": None})
            # KeyError is NOT a RuntimeError — must be caught by the catch-all
            assert r.status_code == 502, f"got {r.status_code}: {r.text}"
            assert "detail" in r.json()
    print("PASS  unexpected error → clean 502 (not 500)")


def test_ask_grounded_and_404():
    _set_keys()
    with patch("app.services.ors.geocode", new=AsyncMock(side_effect=[
                (28.61, 77.20, "Delhi"), (26.91, 75.78, "Jaipur")])), \
         patch("app.services.ors.route", new=AsyncMock(return_value=(POLYLINE, 281.0, 300.0))), \
         patch("app.services.otm.pois_near", new=AsyncMock(side_effect=_places)), \
         patch("app.services.llm.chat_json", new=AsyncMock(return_value={
             "intro": "Go.", "stops": [], "narrative_markdown": ""})), \
         patch("app.services.llm.chat_text", new=AsyncMock(return_value="Fort 28.61 is your best heritage stop.")):
        with TestClient(app_fresh()) as c:
            trip_id = c.post("/trip", json={**BODY, "departure": None}).json()["trip_id"]

            r = c.post(f"/trip/{trip_id}/ask", json={"question": "Where should I stop?"})
            assert r.status_code == 200, r.text
            assert "Fort" in r.json()["answer"]

            # unknown trip → 404
            r404 = c.post("/trip/nope/ask", json={"question": "hi"})
            assert r404.status_code == 404
    print("PASS  ask: grounded 200 + unknown trip 404")


def test_missing_keys_is_400():
    config.settings.ors_api_key = ""
    config.settings.otm_api_key = ""
    config.settings.openrouter_api_key = ""
    with TestClient(app_fresh()) as c:
        r = c.post("/trip", json=BODY)
        assert r.status_code == 400, r.text
    print("PASS  missing keys → 400")


def app_fresh():
    # fresh cache each test to avoid cross-test cache hits
    from app import cache as cache_mod
    cache_mod.cache._mem._data.clear()
    from app.main import app
    return app


if __name__ == "__main__":
    import traceback
    fns = [test_happy_path_and_cache, test_unexpected_error_is_clean_502,
           test_ask_grounded_and_404, test_missing_keys_is_400]
    passed = 0
    for fn in fns:
        try:
            fn()
            passed += 1
        except Exception:
            print(f"FAIL  {fn.__name__}")
            traceback.print_exc()
    print(f"\n{passed}/{len(fns)} passed")
