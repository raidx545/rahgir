"""narrator_node: LLM turns ranked places into a warm, grounded itinerary."""
from __future__ import annotations

import httpx

from ..cache import cache, make_key
from ..config import settings
from ..schemas import Itinerary, TripState
from ..services import llm
from ..services.llm import LLMError

SYSTEM = (
    "You are Rahgir, a warm, factual Indian road-trip companion. "
    "You ONLY describe the places given to you. You must never invent places, "
    "facts, or landmarks not present in the input. If you are unsure about a "
    "place, keep its description generic and honest rather than fabricating."
)

RESPONSE_SHAPE = """Return ONLY a JSON object of this exact shape:
{
  "intro": "one or two warm sentences framing the drive",
  "stops": [
    {"name": "<must match an input name exactly>",
     "why": "2-3 sentences: what it is, why stop, one practical tip"}
  ],
  "narrative_markdown": "the full guide in Markdown, one ### section per stop, in travel order"
}"""


def _place_lines(state: TripState) -> str:
    lines = []
    for i, p in enumerate(state["ranked_places"], 1):
        eta = p.eta.strftime("%H:%M") if p.eta else "n/a"
        lines.append(
            f"{i}. {p.name} | kinds={p.kinds or 'n/a'} | "
            f"{p.nearest_waypoint_km:.0f} km from start | detour~{p.dist_to_route_km:.1f} km off route | "
            f"ETA {eta} | importance {p.rate}/3"
        )
    return "\n".join(lines)


async def narrator_node(state: TripState, client: httpx.AsyncClient) -> TripState:
    req = state["request"]
    ranked = state.get("ranked_places", [])
    warnings = list(state.get("warnings", []))

    if not ranked:
        return {
            "itinerary": Itinerary(
                intro="No stops could be sourced for this route yet.",
                stops=[],
                narrative_markdown="_No POIs were found along this route from the current data sources._",
            )
        }

    user = (
        f"Trip: {req.start} → {req.destination}. Themes: {', '.join(req.themes)}. "
        f"Detour budget: {req.detour_budget_min} min. Total: "
        f"{state['total_distance_km']} km / {state['total_duration_min']:.0f} min.\n\n"
        f"Ranked stops along the route (travel order):\n{_place_lines(state)}\n\n"
        f"{RESPONSE_SHAPE}"
    )

    # Narration depends only on the place set + theme (not the exact departure
    # time), so it caches well across users on the same route.
    sig = "|".join(f"{p.name}:{p.kinds}" for p in ranked)
    key = make_key("narration", settings.openrouter_model, req.themes_key,
                   req.start.lower(), req.destination.lower(), sig)

    try:
        data = await cache.cached_json(
            key,
            settings.ttl_narration_s,
            lambda: llm.chat_json(client, SYSTEM, user),
        )
    except LLMError as e:
        warnings.append(f"Narration failed ({e}); returning ranked stops without prose.")
        return {
            "itinerary": Itinerary(
                intro="",
                stops=ranked,
                narrative_markdown="",
            ),
            "warnings": warnings,
        }

    # Merge the LLM's "why" text back onto the structured ranked places by name.
    why_by_name = {s.get("name", "").strip().lower(): s.get("why", "") for s in data.get("stops", [])}
    for rp in ranked:
        rp.why = why_by_name.get(rp.name.strip().lower(), rp.why)

    itinerary = Itinerary(
        intro=data.get("intro", ""),
        stops=ranked,
        narrative_markdown=data.get("narrative_markdown", ""),
    )
    return {"itinerary": itinerary, "warnings": warnings}
