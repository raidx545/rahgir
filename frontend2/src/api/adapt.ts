import type { Day, LatLng, Stop, StopKind, Trip } from "./types";

/**
 * Adapter: FastAPI/LangGraph backend shape → the UI domain model.
 *
 * The backend returns a FLAT, ranked list of places with ETAs. The UI thinks in
 * days and typed stops, so the mapping happens here and nowhere else — screens
 * stay identical whether the data came from the mock or the real service.
 *
 * ⚠ HONESTY NOTE. The backend does not return money or dwell times. Anything
 * financial below is DERIVED from distance using the constants in `EST`, and
 * the resulting Trip carries `estimated: true` so the UI can label it "est.".
 * Nothing here invents a fact the backend actually knows.
 */

export const EST = {
  FUEL_KMPL: 13.5,          // typical petrol hatchback/sedan on highway
  FUEL_PRICE_INR: 101,      // ₹/litre
  TOLL_PER_100KM: 210,      // NH toll, rough
  // Highway pit-stop durations, not sightseeing days — a planner that turns a
  // 3-hour drive into a 12-hour one is worse than useless.
  DWELL_MIN: { food: 25, sight: 35, fuel: 8, rest: 12, stay: 0, origin: 0, destination: 0 } as Record<StopKind, number>,
  COST_INR:  { food: 260, sight: 150, fuel: 0, rest: 40, stay: 2200, origin: 0, destination: 0 } as Record<StopKind, number>,
  DETOUR_KMPH: 30,          // matches the backend ranker's own assumption
} as const;

/* Backend wire types (only the fields we consume). */
interface BeLatLon { lat: number; lon: number }
interface BePlace {
  xid: string; name: string; kinds: string; point: BeLatLon;
  rate: number; dist_to_route_km: number; nearest_waypoint_km: number;
  photo_ref: string | null; photo_url: string | null;
  score: number; eta: string | null; why: string;
}
export interface BeTrip {
  trip_id: string;
  request: { start: string; destination: string; departure: string | null; detour_budget_min: number; themes: string[] };
  start_point: BeLatLon; end_point: BeLatLon;
  total_distance_km: number; total_duration_min: number;
  polyline: BeLatLon[];
  itinerary: { intro: string; stops: BePlace[]; narrative_markdown: string };
  warnings: string[];
}

const API_BASE = (import.meta.env.VITE_API_BASE as string) || "/api";

const ll = (p: BeLatLon): LatLng => ({ lat: p.lat, lng: p.lon });

/** Google `types` / OpenTripMap `kinds` → our stop taxonomy. */
export function kindOf(kinds: string): StopKind {
  const t = (kinds || "").toLowerCase();
  if (/restaurant|cafe|bakery|meal_takeaway|food|market|dhaba/.test(t)) return "food";
  if (/lodging|hotel|guest_house|resort/.test(t)) return "stay";
  if (/gas_station|fuel|petrol/.test(t)) return "fuel";
  if (/rest_stop|rest area|parking|toilet/.test(t)) return "rest";
  return "sight";
}

/** Same formula the backend ranker uses: there and back at 30 km/h. */
export const detourMinutes = (offRouteKm: number) =>
  Math.round(((2 * offRouteKm) / EST.DETOUR_KMPH) * 60);

function photosFor(p: BePlace): string[] {
  if (p.photo_url) return [p.photo_url];
  if (p.photo_ref) return [`${API_BASE}/photo?ref=${encodeURIComponent(p.photo_ref)}&w=800`];
  return [];
}

export function adaptStop(p: BePlace): Stop {
  const kind = kindOf(p.kinds);
  return {
    id: p.xid || `${p.name}-${p.point.lat.toFixed(4)}`,
    kind,
    name: p.name,
    subtitle: p.kinds
      ? p.kinds.split(",")[0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Stop",
    coord: ll(p.point),
    distanceFromStartKm: Math.round(p.nearest_waypoint_km),
    detourMin: detourMinutes(p.dist_to_route_km),
    dwellMin: EST.DWELL_MIN[kind],
    costInr: EST.COST_INR[kind],
    // `why` is the LLM's grounded reason — shown verbatim, never rewritten.
    why: p.why || "",
    photos: photosFor(p),
    rating: p.rate ? Math.min(5, Math.round((p.rate / 3) * 5 * 10) / 10) : undefined,
    agent: "places",
    alternatives: [],
  };
}

function hhmm(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Full backend trip → UI trip. */
export function adaptTrip(be: BeTrip): Trip {
  const req = be.request;
  const totalKm = Math.round(be.total_distance_km);
  const departure = req.departure ? new Date(req.departure) : new Date();
  const arrival = new Date(departure.getTime() + be.total_duration_min * 60_000);

  const origin: Stop = {
    id: "origin", kind: "origin", name: req.start, subtitle: "Departure",
    coord: ll(be.start_point), distanceFromStartKm: 0, detourMin: 0,
    dwellMin: 0, costInr: 0,
    why: be.itinerary.intro || "",
    photos: [], agent: "route", alternatives: [],
  };
  const destination: Stop = {
    id: "destination", kind: "destination", name: req.destination, subtitle: "Arrival",
    coord: ll(be.end_point), distanceFromStartKm: totalKm, detourMin: 0,
    dwellMin: 0, costInr: 0, why: "", photos: [], agent: "route", alternatives: [],
  };

  const middle = [...be.itinerary.stops]
    .sort((a, b) => a.nearest_waypoint_km - b.nearest_waypoint_km)
    .map(adaptStop);

  // Group into days by the ETA's calendar date; a same-day drive yields one day.
  const buckets = new Map<string, Stop[]>();
  be.itinerary.stops.forEach((p, i) => {
    const key = p.eta ? new Date(p.eta).toDateString() : departure.toDateString();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(middle[i]);
  });
  if (buckets.size === 0) buckets.set(departure.toDateString(), []);

  const keys = [...buckets.keys()];
  const days: Day[] = keys.map((k, i) => {
    const stops = (buckets.get(k) ?? []).sort(
      (a, b) => a.distanceFromStartKm - b.distanceFromStartKm,
    );
    if (i === 0) stops.unshift(origin);
    if (i === keys.length - 1) stops.push(destination);
    const first = stops[0]?.distanceFromStartKm ?? 0;
    const last = stops[stops.length - 1]?.distanceFromStartKm ?? totalKm;
    return {
      index: i + 1,
      label: `Day ${i + 1} · ${req.start} to ${req.destination}`,
      labelHi: ["पहला दिन", "दूसरा दिन", "तीसरा दिन", "चौथा दिन"][i] ?? `दिन ${i + 1}`,
      startTime: i === 0 ? hhmm(departure.toISOString()) : "",
      endTime: i === keys.length - 1 ? hhmm(arrival.toISOString()) : "",
      distanceKm: Math.max(0, last - first),
      driveMin: Math.round(be.total_duration_min / keys.length),
      stops,
    };
  });

  const allStops = days.flatMap((d) => d.stops);
  const fuelLitres = totalKm / EST.FUEL_KMPL;
  const fuelCostInr = Math.round(fuelLitres * EST.FUEL_PRICE_INR);
  const tollsInr = Math.round((totalKm / 100) * EST.TOLL_PER_100KM);
  const foodInr = allStops.filter((s) => s.kind === "food").reduce((n, s) => n + s.costInr, 0);
  const stayInr = allStops.filter((s) => s.kind === "stay").reduce((n, s) => n + s.costInr, 0);
  const otherInr = allStops
    .filter((s) => !["food", "stay", "origin", "destination"].includes(s.kind))
    .reduce((n, s) => n + s.costInr, 0);

  return {
    id: be.trip_id,
    from: req.start, fromHi: "",
    to: req.destination, toHi: "",
    intent: `${req.start} to ${req.destination}`,
    days,
    totalKm,
    totalDriveMin: Math.round(be.total_duration_min),
    fuelLitres: Math.round(fuelLitres * 10) / 10,
    fuelCostInr, tollsInr, foodInr, stayInr,
    budgetInr: fuelCostInr + tollsInr + foodInr + stayInr + otherInr,
    polyline: be.polyline.map(ll),
    estimated: true,
  };
}

/** Streaming `partial` payloads are bare backend places. */
export const adaptPartial = (p: BePlace): Stop => adaptStop(p);
