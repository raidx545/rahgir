"""rank_node: score, budget-filter, and spatially distribute POIs.

Phase-1 scoring (haversine heuristic, per PRD Open Question #2):
    score = w1*popularity + w2*(1/detour) + w3*theme_match + w4*time_fit

Detour cost is approximated as 2x the straight-line distance from the route
(there and back), converted to minutes at a nominal detour speed. Exact
per-candidate routing is deferred to a later phase.
"""
from __future__ import annotations

from ..config import settings
from ..kinds import is_food, is_outdoor, themes_match
from ..schemas import RankedPlace, TripState

# nominal average speed on the small roads a detour usually takes
DETOUR_KMPH = 30.0

W_POP, W_DETOUR, W_THEME, W_TIME = 0.35, 0.30, 0.25, 0.10

MEAL_HOURS = {8, 9, 13, 14, 20, 21}
GOLDEN_HOURS = {5, 6, 7, 17, 18, 19}


def _detour_min(dist_to_route_km: float) -> float:
    return (2 * dist_to_route_km) / DETOUR_KMPH * 60.0


def _time_fit(place) -> float:
    if place.eta is None:
        return 0.5
    hour = place.eta.hour
    if is_food(place.kinds):
        return 1.0 if hour in MEAL_HOURS else 0.4
    if is_outdoor(place.kinds):
        return 1.0 if hour in GOLDEN_HOURS else 0.6
    return 0.6


def rank_node(state: TripState) -> TripState:
    req = state["request"]
    raw = state.get("raw_places", [])
    budget = req.detour_budget_min

    ranked: list[RankedPlace] = []
    for p in raw:
        detour = _detour_min(p.dist_to_route_km)
        if budget and detour > budget:
            continue  # outside the traveller's detour budget

        rp = RankedPlace(**p.model_dump())
        # carry the ETA of the nearest waypoint onto the place
        wp = min(
            state["waypoints"],
            key=lambda w: abs(w.dist_from_start_km - p.nearest_waypoint_km),
        )
        rp.eta = wp.eta

        popularity = min(p.rate, 3) / 3.0
        detour_score = 1.0 / (1.0 + detour / 15.0)  # 1.0 on-route → decays
        theme = themes_match(p.kinds, req.themes)
        timefit = _time_fit(rp)
        rp.score = round(
            W_POP * popularity + W_DETOUR * detour_score + W_THEME * theme + W_TIME * timefit,
            4,
        )
        ranked.append(rp)

    ranked = _dedupe_similar(ranked)
    ranked.sort(key=lambda r: r.score, reverse=True)
    total_km = state.get("total_distance_km", 0.0)
    distributed = _spatially_distribute(ranked, settings.max_ranked, total_km)
    # present in travel order
    distributed.sort(key=lambda r: r.nearest_waypoint_km)
    return {"ranked_places": distributed}


def _dedupe_similar(ranked: list[RankedPlace]) -> list[RankedPlace]:
    """Drop chain/near-duplicate names (e.g. repeated 'Cafe Coffee Day')."""
    best: dict[str, RankedPlace] = {}
    for r in ranked:
        norm = r.name.strip().lower()
        if norm not in best or r.score > best[norm].score:
            best[norm] = r
    return list(best.values())


def _spatially_distribute(
    ranked: list[RankedPlace], limit: int, total_km: float
) -> list[RankedPlace]:
    """Spread picks evenly along the whole route instead of clustering near the
    start: divide the route into `limit` segments and take the best-scored stop
    in each, then backfill remaining slots by score."""
    if len(ranked) <= limit:
        return ranked
    if total_km <= 0:
        return sorted(ranked, key=lambda r: r.score, reverse=True)[:limit]

    seg_len = total_km / limit
    by_seg: dict[int, RankedPlace] = {}
    for r in sorted(ranked, key=lambda r: r.score, reverse=True):
        seg = min(limit - 1, int(r.nearest_waypoint_km / seg_len))
        if seg not in by_seg:  # first (highest-scored) in this segment wins
            by_seg[seg] = r
    chosen = list(by_seg.values())

    if len(chosen) < limit:
        picked = set(id(c) for c in chosen)
        for r in sorted(ranked, key=lambda r: r.score, reverse=True):
            if id(r) not in picked:
                chosen.append(r)
                if len(chosen) >= limit:
                    break
    return chosen
