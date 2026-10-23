// Minimal external store for the current trip, shared across routes without
// a heavy state library. Backed by useSyncExternalStore.
import { useSyncExternalStore } from "react";
import type { TripResponse } from "./api";

let current: TripResponse | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setTrip(trip: TripResponse | null) {
  current = trip;
  emit();
}

export function useTrip(): TripResponse | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}
