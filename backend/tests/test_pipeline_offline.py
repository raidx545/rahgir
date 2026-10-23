"""Offline sanity checks that need no API keys.

Run: ./.venv/bin/python -m pytest tests/  (or just execute this file)
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.geometry import cumulative_distances, haversine_km, sample_polyline
from app.graph import build_graph  # import-time wiring check
from app.nodes.rank import rank_node
from app.nodes.sample import sample_node
from app.schemas import LatLon, Place, TripRequest, TripState


def test_haversine_known_distance():
    # Delhi → Agra is ~180-200 km straight line
    d = haversine_km(28.6139, 77.2090, 27.1767, 78.0081)
    assert 170 < d < 210


def test_sampling_includes_endpoints_and_spacing():
    line = [(28.0, 77.0), (27.0, 78.0)]  # ~145 km diagonal
    samples = sample_polyline(line, step_km=25)
    assert samples[0][1] == 0.0
    total = cumulative_distances(line)[-1]
    assert abs(samples[-1][1] - total) < 1e-6
    # spacing roughly 25 km
    gaps = [b[1] - a[1] for a, b in zip(samples, samples[1:])]
    assert all(g <= 25.001 for g in gaps)


def test_sample_node_builds_waypoints():
    state: TripState = {
        "request": TripRequest(start="A", destination="B"),
        "polyline": [(28.0, 77.0), (27.5, 77.5), (27.0, 78.0)],
        "total_distance_km": 145.0,
        "total_duration_min": 180.0,
    }
    out = sample_node(state)
    wps = out["waypoints"]
    assert len(wps) >= 2
    assert wps[0].dist_from_start_km == 0.0
    assert wps[0].eta is not None


def test_rank_node_budget_and_ordering():
    dep = datetime(2026, 8, 3, 13, 0, tzinfo=timezone.utc)  # 1pm → meal time
    req = TripRequest(start="A", destination="B", theme="foodie", detour_budget_min=45)
    waypoints_state: TripState = {
        "request": req,
        "waypoints": [
            _wp(0.0, dep), _wp(50.0, dep), _wp(100.0, dep),
        ],
        "raw_places": [
            _place("Near Dhaba", "foods", rate=3, off_route=1.0, wp_km=50.0),
            _place("Far Fort", "historic,fortifications", rate=2, off_route=40.0, wp_km=50.0),  # detour > budget
            _place("Roadside Temple", "religion", rate=2, off_route=0.5, wp_km=0.0),
        ],
    }
    out = rank_node(waypoints_state)
    names = [p.name for p in out["ranked_places"]]
    assert "Far Fort" not in names          # over detour budget → filtered
    assert "Near Dhaba" in names            # foodie + on-route + meal-time → kept
    # travel order (by nearest_waypoint_km)
    kms = [p.nearest_waypoint_km for p in out["ranked_places"]]
    assert kms == sorted(kms)


def test_graph_compiles():
    import httpx
    g = build_graph(httpx.AsyncClient())
    assert g is not None


# --- helpers ---
def _wp(km, eta):
    from app.schemas import Waypoint
    return Waypoint(point=LatLon(lat=27.0 + km / 1000, lon=78.0), dist_from_start_km=km, eta=eta)


def _place(name, kinds, rate, off_route, wp_km):
    p = Place(
        xid=name.replace(" ", ""),
        name=name,
        kinds=kinds,
        point=LatLon(lat=27.0, lon=78.0),
        rate=rate,
    )
    p.dist_to_route_km = off_route
    p.nearest_waypoint_km = wp_km
    return p


if __name__ == "__main__":
    import traceback

    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
            passed += 1
        except Exception:
            print(f"FAIL  {fn.__name__}")
            traceback.print_exc()
    print(f"\n{passed}/{len(fns)} passed")
