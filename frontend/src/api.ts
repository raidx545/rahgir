// API types mirror backend/app/schemas.py and a thin client for POST /trip.

export type Theme = "balanced" | "foodie" | "heritage" | "nature" | "religious";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface RankedPlace {
  xid: string;
  name: string;
  kinds: string;
  point: LatLon;
  rate: number;
  dist_to_route_km: number;
  nearest_waypoint_km: number;
  wikidata: string | null;
  photo_ref: string | null;
  photo_url: string | null;
  score: number;
  eta: string | null; // ISO datetime
  why: string;
}

export interface Itinerary {
  intro: string;
  stops: RankedPlace[];
  narrative_markdown: string;
}

export interface TripRequest {
  start: string;
  destination: string;
  departure?: string | null;
  detour_budget_min: number;
  themes: Theme[];
}

export interface TripResponse {
  trip_id: string;
  request: TripRequest;
  start_point: LatLon;
  end_point: LatLon;
  total_distance_km: number;
  total_duration_min: number;
  waypoint_count: number;
  raw_place_count: number;
  polyline: LatLon[];
  itinerary: Itinerary;
  warnings: string[];
}

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export async function planTrip(req: TripRequest): Promise<TripResponse> {
  const res = await fetch(`${BASE}/trip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    let detail = `Request failed (HTTP ${res.status}).`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }
  return res.json();
}

export interface Suggestion {
  label: string;
  lat: number | null;
  lon: number | null;
}

export async function autocomplete(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  if (q.trim().length < 2) return [];
  try {
    const res = await fetch(`${BASE}/autocomplete?q=${encodeURIComponent(q)}`, { signal });
    if (!res.ok) return [];
    return (await res.json()) as Suggestion[];
  } catch {
    return []; 
  }
}

export async function getTrip(tripId: string): Promise<TripResponse> {
  const res = await fetch(`${BASE}/trip/${encodeURIComponent(tripId)}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("This trip has expired or was not found.");
    throw new Error(`Could not load trip (HTTP ${res.status}).`);
  }
  return res.json();
}

export async function askTripStream(
  tripId: string,
  question: string,
  onChunk: (fullText: string) => void,
): Promise<string> {
  const res = await fetch(`${BASE}/trip/${encodeURIComponent(tripId)}/ask/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok || !res.body) {
    let detail = `Request failed (HTTP ${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onChunk(full);
  }
  return full;
}

export async function askTrip(tripId: string, question: string): Promise<string> {
  const res = await fetch(`${BASE}/trip/${encodeURIComponent(tripId)}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    let detail = `Request failed (HTTP ${res.status}).`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }
  const data = await res.json();
  return data.answer as string;
}

// --- small display helpers ---
export function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** Build a same-origin photo URL that the backend resolves server-side. */
export function photoUrl(ref: string | null, w = 400): string | null {
  if (!ref) return null;
  return `${API_BASE}/photo?ref=${encodeURIComponent(ref)}&w=${w}`;
}

/** Image for a stop: a direct URL (OTM/Wikipedia) or the Google photo proxy. */
export function stopPhoto(
  place: { photo_url: string | null; photo_ref: string | null },
  w = 400,
): string | null {
  return place.photo_url ?? photoUrl(place.photo_ref, w);
}

const FOOD_TOKENS = [
  "foods", "restaurants", "marketplaces",
  "restaurant", "cafe", "bakery", "meal_takeaway", "food", "market",
];

export function isFoodKind(kinds: string): boolean {
  const toks = (kinds || "").split(",");
  return toks.some((t) => FOOD_TOKENS.includes(t.trim()));
}

/** Map an OpenTripMap `kinds` OR Google `types` string to a short label. */
export function prettyKind(kinds: string): string {
  if (!kinds) return "Place";
  // ordered: first matching token wins
  const map: [string, string][] = [
    ["restaurant", "Food"], ["cafe", "Food"], ["bakery", "Food"],
    ["meal_takeaway", "Food"], ["foods", "Food"],
    ["market", "Market"], ["supermarket", "Market"], ["marketplaces", "Market"],
    ["hindu_temple", "Spiritual"], ["church", "Spiritual"], ["mosque", "Spiritual"],
    ["place_of_worship", "Spiritual"], ["religion", "Spiritual"],
    ["museum", "Museum"], ["art_gallery", "Museum"], ["museums", "Museum"],
    ["historical_landmark", "Heritage"], ["historic", "Heritage"],
    ["fortifications", "Fort"], ["monuments", "Monument"], ["monument", "Monument"],
    ["architecture", "Architecture"], ["cultural", "Cultural"],
    ["national_park", "Nature"], ["park", "Nature"], ["gardens", "Garden"],
    ["garden", "Nature"], ["hiking_area", "Nature"], ["zoo", "Nature"],
    ["natural", "Nature"], ["tourist_attraction", "Attraction"],
  ];
  const toks = kinds.split(",").map((t) => t.trim());
  for (const [token, label] of map) if (toks.includes(token)) return label;
  return toks[0].replace(/_/g, " ");
}
