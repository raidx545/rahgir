"""FastAPI entrypoint for Rahgir.

Endpoints (Phase 1):
    GET  /health
    POST /trip           → run the pipeline, return itinerary JSON
    GET  /trip/{trip_id} → fetch a previously generated trip

Production notes:
  * Redis (REDIS_URL) backs the cache AND the trip store, so results are shared
    across workers and survive restarts. Without it, an in-process fallback is
    used automatically (dev).
  * Per-IP rate limiting protects the external API quotas (slowapi).
  * Every unexpected error is logged with a traceback and returned as a clean
    JSON message — no more opaque HTTP 500s.
"""
# NOTE: intentionally NO `from __future__ import annotations` here. slowapi's
# @limiter.limit wrapper makes FastAPI resolve string annotations against the
# wrong module globals, which would misclassify the request body as a query
# param. Real annotation objects avoid that.
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import re

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .cache import cache, make_key
from .config import settings
from .graph import build_graph
from .schemas import (
    AskRequest,
    AskResponse,
    Itinerary,
    LatLon,
    Suggestion,
    TripRequest,
    TripResponse,
    TripState,
)
from .services import llm
from .services import places as poi_provider

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
log = logging.getLogger("rahgir")

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url or "memory://",
    default_limits=[settings.rate_limit_default],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await cache.connect()

    limits = httpx.Limits(max_connections=100, max_keepalive_connections=20)
    client = httpx.AsyncClient(
        headers={"User-Agent": "Rahgir/0.1"},
        limits=limits,
        timeout=httpx.Timeout(settings.request_timeout_s),
    )
    app.state.client = client
    app.state.graph = build_graph(client)
    log.info("Rahgir up. cache=%s", cache.backend)
    try:
        yield
    finally:
        await client.aclose()
        await cache.close()


app = FastAPI(title="Rahgir", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,  
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests — please slow down and try again shortly."},
    )


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):

    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=502,
        content={"detail": f"Trip planning failed: {type(exc).__name__}: {exc}"},
    )


def _id_key(trip_id: str) -> str:
    return f"rahgir:tripid:{trip_id}"


def _req_key(req: TripRequest) -> str | None:
    """Cache key for a full trip result. Only when departure is explicit, so we
    never cache a 'now'-relative result that would go stale."""
    if not req.departure:
        return None
    hour = req.departure.astimezone(timezone.utc).strftime("%Y%m%d%H")
    return make_key("trip", req.start.lower(), req.destination.lower(),
                    hour, req.detour_budget_min, req.themes_key, settings.openrouter_model)


def _required_keys() -> tuple[str, ...]:
    """Keys the current POI provider needs, plus routing + LLM."""
    poi_key = "google_places_api_key" if poi_provider.provider_name() == "google" else "otm_api_key"
    return ("ors_api_key", poi_key, "openrouter_api_key")


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "cache": cache.backend,
        "poi_provider": poi_provider.provider_name(),
        "keys": {
            "ors": bool(settings.ors_api_key),
            "otm": bool(settings.otm_api_key),
            "google_places": bool(settings.google_places_api_key),
            "openrouter": bool(settings.openrouter_api_key),
        },
        "model": settings.openrouter_model,
    }


@app.get("/autocomplete", response_model=list[Suggestion])
@limiter.limit(settings.rate_limit_default)
async def autocomplete(request: Request, q: str = Query("", max_length=120)) -> list[Suggestion]:
    """Place-name suggestions for the planner inputs (India-biased)."""
    if len((q or "").strip()) < 2:
        return []
    try:
        items = await poi_provider.autocomplete(app.state.client, q)
    except RuntimeError:
        return []  # autocomplete is optional — never surface an error to typing
    return [Suggestion(**it) for it in items]


@app.post("/trip", response_model=TripResponse)
@limiter.limit(settings.rate_limit_trip)
async def create_trip(request: Request, req: TripRequest) -> TripResponse:
    try:
        settings.require(*_required_keys())
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 1. Full-trip cache: identical request (incl. departure hour) → instant.
    rkey = _req_key(req)
    if rkey:
        cached = await cache.get_json(rkey)
        if cached:
            log.info("trip cache HIT %s→%s", req.start, req.destination)
            await cache.set_json(_id_key(cached["trip_id"]), cached, settings.ttl_trip_s)
            return TripResponse(**cached)

    # 2. Run the pipeline. Known service errors → clean 502; the catch-all
    #    handler covers anything unexpected.
    initial: TripState = {"request": req, "warnings": []}
    try:
        final: TripState = await app.state.graph.ainvoke(initial)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    resp = await _finalize_trip(req, final, rkey)
    return resp


async def _finalize_trip(req: TripRequest, final: dict, rkey: str | None) -> TripResponse:
    """Build, enrich and cache the TripResponse from a finished pipeline state.

    Shared by POST /trip and the streaming planner so both return identical data.
    """
    itinerary = final.get("itinerary") or Itinerary()
    # Best-effort images for the itinerary cards (cached with the trip).
    try:
        await poi_provider.enrich_photos(app.state.client, itinerary.stops)
    except Exception:  # noqa: BLE001 — photos are optional, never fail the trip
        log.warning("photo enrichment failed", exc_info=True)

    resp = TripResponse(
        trip_id=uuid.uuid4().hex[:12],
        request=req,
        start_point=final["start_point"],
        end_point=final["end_point"],
        total_distance_km=final["total_distance_km"],
        total_duration_min=final["total_duration_min"],
        waypoint_count=len(final.get("waypoints", [])),
        raw_place_count=len(final.get("raw_places", [])),
        polyline=[LatLon(lat=la, lon=lo) for la, lo in final.get("polyline", [])],
        itinerary=itinerary,
        warnings=final.get("warnings", []),
    )

    payload = resp.model_dump(mode="json")
    await cache.set_json(_id_key(resp.trip_id), payload, settings.ttl_trip_s)
    if rkey:
        await cache.set_json(rkey, payload, settings.ttl_trip_s)
    return resp


# The pipeline, in order, with the labels the UI shows. These are the REAL
# LangGraph nodes — progress is observed, not simulated.
PIPELINE: list[tuple[str, str]] = [
    ("route",    "Tracing the highway"),
    ("sample",   "Marking milestones along the way"),
    ("places",   "Looking for what's worth stopping for"),
    ("rank",     "Scoring detours against your budget"),
    ("narrator", "Writing it up like a local friend"),
]


@app.post("/trip/plan/stream")
@limiter.limit(settings.rate_limit_trip)
async def plan_stream(request: Request, req: TripRequest):
    """Stream the LangGraph pipeline as NDJSON, one event per line.

    Uses `astream(stream_mode="updates")`, so each event corresponds to a real
    node completing — the UI's agent trace reflects actual backend work.
    """
    try:
        settings.require(*_required_keys())
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    rkey = _req_key(req)

    async def gen():
        def ev(obj: dict) -> str:
            return json.dumps(obj, default=str) + "\n"

        # Serve an identical cached request instantly, but keep the same
        # event shape so the client has one code path.
        if rkey:
            cached = await cache.get_json(rkey)
            if cached:
                for node, label in PIPELINE:
                    yield ev({"type": "agent", "agent": node, "status": "done", "message": label})
                yield ev({"type": "done", "trip": cached, "cached": True})
                return

        final: dict = {}
        idx = 0
        yield ev({"type": "agent", "agent": PIPELINE[0][0], "status": "running",
                  "message": PIPELINE[0][1]})
        try:
            initial: TripState = {"request": req, "warnings": []}
            async for chunk in app.state.graph.astream(initial, stream_mode="updates"):
                for node, delta in chunk.items():
                    if delta:
                        final.update(delta)

                    # Node-specific payloads the UI can render immediately.
                    if node == "route":
                        poly = final.get("polyline") or []
                        yield ev({
                            "type": "route",
                            "polyline": [{"lat": la, "lon": lo} for la, lo in poly],
                            "totalKm": final.get("total_distance_km", 0),
                            "totalMin": final.get("total_duration_min", 0),
                        })
                        msg = (f"{final.get('total_distance_km', 0):.0f} km · "
                               f"{(final.get('total_duration_min') or 0) / 60:.1f}h")
                    elif node == "sample":
                        msg = f"{len(final.get('waypoints', []))} waypoints"
                    elif node == "places":
                        msg = f"{len(final.get('raw_places', []))} places found"
                    elif node == "rank":
                        ranked = final.get("ranked_places", []) or []
                        for p in ranked:
                            yield ev({"type": "partial",
                                      "stop": p.model_dump(mode="json")})
                        msg = f"{len(ranked)} stops chosen"
                    else:
                        it = final.get("itinerary")
                        msg = "itinerary ready" if it else "no narration"

                    yield ev({"type": "agent", "agent": node, "status": "done", "message": msg})

                    idx += 1
                    if idx < len(PIPELINE):
                        nxt, label = PIPELINE[idx]
                        yield ev({"type": "agent", "agent": nxt, "status": "running",
                                  "message": label})

            resp = await _finalize_trip(req, final, rkey)
            yield ev({"type": "done", "trip": resp.model_dump(mode="json")})

        except RuntimeError as e:
            code = "no_route" if "route" in str(e).lower() else "agent_failed"
            node = PIPELINE[min(idx, len(PIPELINE) - 1)][0]
            yield ev({"type": "agent", "agent": node, "status": "failed", "message": str(e)})
            yield ev({"type": "error", "code": code, "message": str(e), "agent": node})
        except Exception as e:  # noqa: BLE001
            log.exception("plan_stream failed")
            yield ev({"type": "error", "code": "unknown",
                      "message": f"{type(e).__name__}: {e}"})

    return StreamingResponse(gen(), media_type="application/x-ndjson")


@app.get("/trip/{trip_id}", response_model=TripResponse)
async def get_trip(trip_id: str) -> TripResponse:
    data = await cache.get_json(_id_key(trip_id))
    if not data:
        raise HTTPException(status_code=404, detail="Trip not found or expired.")
    return TripResponse(**data)


def _trip_context(trip: TripResponse) -> str:
    """Compact, grounded summary of a trip for the Q&A prompt."""
    req = trip.request
    lines = [
        f"Trip: {req.start} -> {req.destination}. "
        f"{trip.total_distance_km:.0f} km, ~{trip.total_duration_min:.0f} min driving. "
        f"Themes: {', '.join(req.themes)}. Detour budget: {req.detour_budget_min} min.",
        "Planned stops (in travel order):",
    ]
    if not trip.itinerary.stops:
        lines.append("  (no stops were found along this route)")
    for i, s in enumerate(trip.itinerary.stops, 1):
        eta = s.eta or "n/a"
        lines.append(
            f"  {i}. {s.name} — {s.kinds or 'place'}, "
            f"~{s.dist_to_route_km:.1f} km off route, ETA {eta}."
            + (f" {s.why}" if s.why else "")
        )
    if trip.itinerary.intro:
        lines.append(f"Overview: {trip.itinerary.intro}")
    return "\n".join(lines)


ASK_SYSTEM = (
    "You are Rahgir, a warm, concise Indian road-trip companion. Answer the "
    "traveller's question using ONLY the route data provided. If the answer is "
    "not in that data, say so plainly and suggest what they could do instead — "
    "do NOT invent places, timings, or facts. Keep it to a few sentences."
)


@app.post("/trip/{trip_id}/ask", response_model=AskResponse)
@limiter.limit(settings.rate_limit_trip)
async def ask_trip(request: Request, trip_id: str, body: AskRequest) -> AskResponse:
    try:
        settings.require("openrouter_api_key")
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    data = await cache.get_json(_id_key(trip_id))
    if not data:
        raise HTTPException(status_code=404, detail="Trip not found or expired — plan a route first.")
    trip = TripResponse(**data)

    user = f"Route data:\n{_trip_context(trip)}\n\nTraveller asks: {body.question.strip()}"
    try:
        answer = await llm.chat_text(app.state.client, ASK_SYSTEM, user)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return AskResponse(answer=answer or "Sorry, I couldn't come up with an answer for that.")


@app.post("/trip/{trip_id}/ask/stream")
@limiter.limit(settings.rate_limit_trip)
async def ask_trip_stream(request: Request, trip_id: str, body: AskRequest):
    """Same as /ask but streams the answer token-by-token as plain text."""
    try:
        settings.require("openrouter_api_key")
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    data = await cache.get_json(_id_key(trip_id))
    if not data:
        raise HTTPException(status_code=404, detail="Trip not found or expired — plan a route first.")
    trip = TripResponse(**data)
    user = f"Route data:\n{_trip_context(trip)}\n\nTraveller asks: {body.question.strip()}"

    async def gen():
        try:
            async for chunk in llm.stream_text(app.state.client, ASK_SYSTEM, user):
                yield chunk
        except RuntimeError as e:
            yield f"\n\n[Sorry — {e}]"

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


# Google photo resource names look like: places/<id>/photos/<id>
_PHOTO_REF_RE = re.compile(r"^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$")
_GPHOTO_MEDIA = "https://places.googleapis.com/v1/{ref}/media"


@app.get("/photo")
async def photo(ref: str = Query(..., max_length=512), w: int = Query(400, ge=64, le=1600)):
    """Resolve a Google Places photo reference to an image URL, server-side.

    Keeps GOOGLE_PLACES_API_KEY off the client; the resolved googleusercontent
    URL contains no key. Resolved URLs are cached briefly (they are short-lived).
    """
    if not settings.google_places_api_key:
        raise HTTPException(status_code=404, detail="Photos unavailable (no Google key).")
    if not _PHOTO_REF_RE.match(ref):
        raise HTTPException(status_code=400, detail="Invalid photo reference.")

    ckey = make_key("photouri", ref, w)
    uri = await cache.get(ckey)
    if not uri:
        if not await cache.incr_daily("google", settings.google_daily_cap):
            raise HTTPException(status_code=429, detail="Daily Google budget reached.")
        params = {"maxWidthPx": w, "skipHttpRedirect": "true",
                  "key": settings.google_places_api_key}
        try:
            r = await app.state.client.get(_GPHOTO_MEDIA.format(ref=ref), params=params)
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Photo fetch failed: {e}")
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Photo fetch failed (HTTP {r.status_code}).")
        uri = (r.json() or {}).get("photoUri")
        if not uri:
            raise HTTPException(status_code=502, detail="No photo URI returned.")
        await cache.set(ckey, uri, 3000)  # ~50 min; Google URIs are short-lived

    resp = RedirectResponse(url=uri, status_code=307)
    resp.headers["Cache-Control"] = "public, max-age=3000"
    return resp
