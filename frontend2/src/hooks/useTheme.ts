import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const KEY = "rahgir.theme";
export type Theme = "day" | "night";

/* A SHARED store — every consumer sees the same theme.
   (Per-component state would leave the map tiles on the old theme when the
   header toggle fires, since only the <html> class is global.) */
const listeners = new Set<() => void>();

function read(): Theme {
  const saved = localStorage.getItem(KEY) as Theme | null;
  if (saved === "day" || saved === "night") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

let current: Theme = read();

function apply(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "night");
  document.documentElement.style.colorScheme = t === "night" ? "dark" : "light";
}
apply(current);

function setTheme(t: Theme) {
  current = t;
  localStorage.setItem(KEY, t);
  apply(t);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Day / Night-drive theme, shared app-wide. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current, () => current);
  const toggle = useCallback(
    () => setTheme(current === "day" ? "night" : "day"),
    [],
  );
  return { theme, setTheme, toggle };
}

/** Respect the OS reduced-motion setting in JS-driven animation too. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
