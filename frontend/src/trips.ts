// Local trip history + saved trips, persisted in localStorage. Trips themselves
// live on the backend (GET /trip/{id}); here we only keep lightweight summaries
// so the Trips/Saved pages can list them and re-open via ?trip=<id>.
import { useSyncExternalStore } from "react";
import type { TripResponse } from "./api";

export interface TripSummary {
  trip_id: string;
  start: string;
  destination: string;
  total_distance_km: number;
  total_duration_min: number;
  stops: number;
  themes: string[];
  saved: boolean;
  ts: number; // last opened, ms
}

const KEY = "rahgir.trips";
const listeners = new Set<() => void>();

// Cache the parsed snapshot so useSyncExternalStore gets a STABLE reference when
// the underlying data hasn't changed (otherwise it infinite-loops).
let snapRaw = "";
let snapVal: TripSummary[] = [];

function read(): TripSummary[] {
  const raw = localStorage.getItem(KEY) || "[]";
  if (raw === snapRaw) return snapVal;
  try {
    snapVal = JSON.parse(raw);
  } catch {
    snapVal = [];
  }
  snapRaw = raw;
  return snapVal;
}

function write(list: TripSummary[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  listeners.forEach((l) => l());
}

export function summarize(t: TripResponse): TripSummary {
  return {
    trip_id: t.trip_id,
    start: t.request.start,
    destination: t.request.destination,
    total_distance_km: t.total_distance_km,
    total_duration_min: t.total_duration_min,
    stops: t.itinerary.stops.length,
    themes: t.request.themes,
    saved: false,
    ts: Date.now(),
  };
}

/** Record (or refresh) a trip in history, preserving its saved flag. */
export function recordTrip(t: TripResponse) {
  if (!t.trip_id || t.trip_id === "demo") return;
  const list = read();
  const existing = list.find((x) => x.trip_id === t.trip_id);
  const summary = { ...summarize(t), saved: existing?.saved ?? false };
  const rest = list.filter((x) => x.trip_id !== t.trip_id);
  write([summary, ...rest]);
}

export function toggleSave(tripId: string) {
  write(read().map((x) => (x.trip_id === tripId ? { ...x, saved: !x.saved } : x)));
}

export function removeTrip(tripId: string) {
  write(read().filter((x) => x.trip_id !== tripId));
}

export function isSaved(tripId: string): boolean {
  return read().find((x) => x.trip_id === tripId)?.saved ?? false;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTrips(): TripSummary[] {
  return useSyncExternalStore(subscribe, read, read);
}
