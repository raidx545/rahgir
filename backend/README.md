# Rahgir — Backend (Phase 1)

> "Google Maps tells you how to get there. Rahgir tells you what you'll miss on the way."

FastAPI + LangGraph pipeline that turns a **start → destination** into a
route-aware, ranked, narrated itinerary of places worth stopping for.

## Pipeline

```
POST /trip
   │
route ──▶ sample ──▶ places ──▶ rank ──▶ narrator ──▶ Itinerary JSON
   │         │          │          │          │
 ORS      polyline   OpenTripMap  score +   OpenRouter
 geocode  every      fan-out per  budget    (grounded,
 + route  ~25 km     waypoint,    filter +  no invented
                     dedupe       spatial   places)
                                  spread
```

Maps to PRD §7 (`route_node → sample_node → places_node → rank_node → narrator_node → END`).

## Setup

```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env      # then paste your three keys into .env
```

Keys (all free / BYO):
- **ORS_API_KEY** — https://openrouteservice.org/dev/#/signup (route + geocode)
- **OTM_API_KEY** — https://opentripmap.io/product (POIs)
- **OPENROUTER_API_KEY** — https://openrouter.ai/keys (LLM narration)

## Run

```bash
./.venv/bin/uvicorn app.main:app --reload --port 8000

```

- Health: `GET http://127.0.0.1:8000/health` — shows which keys are loaded.
- Docs (Swagger): `http://127.0.0.1:8000/docs`

### Example

```bash
curl -X POST http://127.0.0.1:8000/trip \
  -H 'Content-Type: application/json' \
  -d '{
    "start": "Ghaziabad",
    "destination": "Etawah",
    "detour_budget_min": 45,
    "theme": "foodie"
  }'
```

Returns route stats, waypoint/POI counts, and an `itinerary` with an intro,
travel-ordered `stops` (each with score, ETA, and a grounded `why`), plus
`narrative_markdown`. Any data-source gaps show up in `warnings`.

## Tests (no keys needed)

```bash
./.venv/bin/python -m tests.test_pipeline_offline
```

Two more suites need no keys either (they mock the external services):

```bash
./.venv/bin/python -m tests.test_graph_invoke   # full LangGraph run, mocked
./.venv/bin/python -m tests.test_api            # endpoints: 200, cache, clean errors
```

`test_api` specifically asserts that an unexpected exception returns a clean
502 (not an opaque 500) and that an identical request is served from cache.

## POI provider: OpenTripMap ↔ Google Places

The POI source is swappable via `POI_PROVIDER` — the pipeline is
provider-agnostic (both expose the same `pois_near() -> list[Place]`).

| | `otm` (default) | `google` |
|---|---|---|
| Cost | free | **paid per request** (billing required) |
| Coverage (tier-2/3 India) | sparse | strong (fixes PRD §12) |
| Photos | no | yes (Famous-For cards) |
| Key | `OTM_API_KEY` | `GOOGLE_PLACES_API_KEY` |

Switch by setting in `.env`:

```bash
POI_PROVIDER=google
GOOGLE_PLACES_API_KEY=...   # billing enabled
POI_PHOTOS=true
```

Because every Google Nearby Search is billed, the **Redis cache is what makes
this affordable** — identical waypoints/routes are served from cache, so a
popular route costs one set of calls, not one per user. Photos are resolved
lazily and only for the stops actually shown, via `GET /photo?ref=...` which
keeps the API key server-side. `google.pois_near` maps Google `types` →
`kinds` and `rating`+`userRatingCount` → the 0–3 importance score, so ranking
and labels work unchanged. Category semantics for both vocabularies live in
`app/kinds.py`.

## Production: fast + safe for many users

**Caching (biggest speed win).** Every external call is cached — geocode,
route, per-waypoint POIs, and the LLM narration — plus the full trip result.
A repeated route returns in ~**60 ms** instead of several seconds, and free-tier
API quotas are barely touched. Set `REDIS_URL` to share the cache across all
workers and survive restarts; without it, an in-process cache is used
automatically (dev). See TTLs in `.env.example`.

**Run with multiple workers** (shared cache/store/rate-limits via Redis):

```bash
REDIS_URL=redis://localhost:6379/0 \
  ./.venv/bin/gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000
```

**Safety.** Per-IP rate limiting (`RATE_LIMIT_TRIP`, default 20/min) via
slowapi; env-driven CORS allow-list (`CORS_ORIGINS`); bounded httpx connection
pool + timeouts; and a catch-all handler that logs tracebacks and returns clean
JSON errors. Provider API keys never leave the server — the browser only talks
to this API.

| Concern | Mechanism |
|---|---|
| Repeated routes are slow | Redis cache of geocode/route/POI/LLM + full trip |
| One user hammering the API | slowapi per-IP rate limit |
| Multiple workers / restarts | Redis-backed cache **and** trip store |
| Opaque 500s | typed service errors + catch-all handler with logging |
| Load spikes | httpx pool limits + request timeouts |

## Tuning

Pipeline knobs live in `.env` (sample spacing, POI radius, importance
threshold, itinerary size, cache TTLs, rate limits) — see `.env.example`.

## What's stubbed / next (per PRD roadmap)

- **Famous-for agent** (§FR-3) — primary source for sparse tier-2/3 towns; the
  `places` node currently only uses OpenTripMap and emits a warning when empty.
- **Detour cost** uses the haversine heuristic (PRD Open Question #2); exact
  per-candidate routing is deferred.
- **Persistence**: trips are stored in the cache (Redis in prod, in-process in
  dev). Add a durable DB if you need trips to outlive the cache TTL.
- **Q&A over Qdrant** (§FR-6), **share/PDF** (§FR-7), **WebSocket streaming
  progress** (§9) — later phases.
```
