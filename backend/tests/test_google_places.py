"""Google Places provider tests (mocked HTTP — no key, no network, no cost).

Run: ./.venv/bin/python -m tests.test_google_places
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, patch

from app import config
from app.kinds import is_food, pretty_kind, theme_match
from app.services import places, places_google

SAMPLE = {
    "places": [
        {
            "id": "ChIJ_fort",
            "displayName": {"text": "Amber Fort"},
            "location": {"latitude": 26.985, "longitude": 75.851},
            "types": ["historical_landmark", "tourist_attraction"],
            "primaryType": "historical_landmark",
            "rating": 4.6,
            "userRatingCount": 42000,
            "photos": [{"name": "places/ChIJ_fort/photos/AbC123"}],
        },
        {
            "id": "ChIJ_dhaba",
            "displayName": {"text": "Highway Dhaba"},
            "location": {"latitude": 27.1, "longitude": 76.0},
            "types": ["restaurant"],
            "rating": 4.1,
            "userRatingCount": 800,
            "photos": [],
        },
        {  # malformed: no name → skipped
            "location": {"latitude": 1, "longitude": 1},
        },
    ]
}


class _Resp:
    status_code = 200

    def json(self):
        return SAMPLE

    text = ""


def test_google_mapping():
    config.settings.google_places_api_key = "test"
    from app import cache as cache_mod
    cache_mod.cache._mem._data.clear()

    async def run():
        client = AsyncMock()
        client.post = AsyncMock(return_value=_Resp())
        # real in-process cache (no Redis, no patch needed); only HTTP is mocked
        return await places_google.pois_near(client, 27.0, 76.0)

    out = asyncio.run(run())
    assert len(out) == 2, "malformed entry should be skipped"
    fort = out[0]
    assert fort.name == "Amber Fort"
    assert fort.kinds == "historical_landmark,tourist_attraction"
    assert fort.rate == 3, f"high rating+count → 3, got {fort.rate}"
    assert fort.photo_ref == "places/ChIJ_fort/photos/AbC123"
    print("PASS  google mapping (fields, rate, photo_ref, skip malformed)")


def test_kinds_semantics_for_google_types():
    assert pretty_kind("historical_landmark,tourist_attraction") == "Heritage"
    assert pretty_kind("restaurant") == "Food"
    assert pretty_kind("hindu_temple") == "Spiritual"
    assert is_food("restaurant") is True
    assert is_food("historical_landmark") is False
    assert theme_match("restaurant", "foodie") == 1.0
    assert theme_match("hindu_temple", "foodie") == 0.0
    assert theme_match("hindu_temple", "religious") == 1.0
    print("PASS  kinds semantics handle Google types")


def test_dispatch_selects_provider():
    config.settings.poi_provider = "google"
    assert places.provider_name() == "google"
    config.settings.poi_provider = "otm"
    assert places.provider_name() == "otm"
    print("PASS  provider dispatch by config")


if __name__ == "__main__":
    import traceback
    fns = [test_google_mapping, test_kinds_semantics_for_google_types, test_dispatch_selects_provider]
    passed = 0
    for fn in fns:
        try:
            fn(); passed += 1
        except Exception:
            print(f"FAIL  {fn.__name__}"); traceback.print_exc()
    print(f"\n{passed}/{len(fns)} passed")
