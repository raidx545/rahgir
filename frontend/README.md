# Rahgir / BharatVenture — Frontend

React + TypeScript + Vite + Tailwind, built to the Figma design. Two screens:

- **Trip Planner** (`/`) — "Craft Your Journey" form → `POST /trip`.
- **Route Dashboard** (`/dashboard`) — itinerary timeline + live Leaflet map,
  rendered from the backend response.

## Design system (from Figma)

- Fonts: **EB Garamond** (serif headings) + **Plus Jakarta Sans** (UI).
- Palette (see `tailwind.config.js`): paper `#f9f7f2`, sand `#f2efe9`,
  ink/primary `#061b0e`, chip green `#1b3022`, rust accent `#a04100`.
- Shared shell: 256px sidebar + 64px top nav (`components/Layout.tsx`).

## Run

The frontend proxies `/api/*` → the FastAPI backend on `:8000` (see
`vite.config.ts`), so run both:

```bash
# terminal 1 — backend (needs .env keys, see ../backend/README.md)
cd ../backend && ./.venv/bin/uvicorn app.main:app --reload --port 8000

# terminal 2 — frontend
npm install
npm run dev            # http://localhost:5173
```

Fill in the planner, hit **Discover the Route** — it calls the backend and
navigates to the dashboard with the real itinerary + route.

### Preview the dashboard without a backend

```
http://localhost:5173/dashboard?demo=1
```

Renders a sample Delhi → Jaipur trip (`src/demo.ts`) — handy for design work.

## Structure

```
src/
├── App.tsx           persistent shell (TopNav + Sidebar) + animated routes
├── motion.ts         shared framer-motion variants (page / stagger / pop)
├── api.ts            types mirroring backend schemas + planTrip() client
├── store.ts          tiny useSyncExternalStore for the current trip
├── demo.ts           sample trip fixture (?demo=1)
├── components/
│   ├── Sidebar.tsx · TopNav.tsx
│   └── RouteMap.tsx  react-leaflet map: polyline + start/stop/end markers
└── pages/
    ├── Planner.tsx   the form (staggered sections, tap/hover micro-interactions)
    └── Dashboard.tsx timeline, stop cards, chat panel, map overlay
```

## Transitions (framer-motion)

The nav shell stays mounted; only the content area animates, so navigation is
instant and nothing flashes. Pages fade/slide via `AnimatePresence` (`mode="wait"`),
the planner form and dashboard timeline **stagger** their children in, and the
map overlay pops. All transforms are opacity/translate only (GPU-friendly,
~0.2–0.3s) and honor `prefers-reduced-motion` via `MotionConfig`.

## Notes / next

- The **chat panel** and **map floating controls** are UI-only for now; wire
  the chat to `POST /trip/{id}/ask` when the Q&A endpoint lands (PRD §FR-6).
- The planner sends a single `theme` (backend's current contract); the UI lets
  you multi-select vibes — extend the backend to accept multiple to use them.
- Map tiles are OpenStreetMap. Swap for a styled provider (MapTiler/Mapbox) if
  you want the muted look from the mockup.
