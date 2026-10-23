import { AGENTS, TRIPS, matchTrip } from "./fixtures";
import { adaptPartial, adaptTrip, type BeTrip } from "./adapt";
import type { PlanEvent, RahgirApi, Scenario, Trip } from "./types";

/**
 * ONE typed boundary for the whole app.
 *
 * Today it resolves to `mockApi`. To talk to the real FastAPI/LangGraph
 * backend, set VITE_API_BASE (e.g. "/api") and `httpApi` is used instead —
 * no screen or component changes required.
 */

const BASE = import.meta.env.VITE_API_BASE as string | undefined;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      rej(new DOMException("aborted", "AbortError"));
    }, { once: true });
  });

/* ── Mock implementation ────────────────────────────────────────────────── */

export const mockApi: RahgirApi = {
  async listTrips() {
    await sleep(200);
    return TRIPS;
  },

  async getTrip(id: string) {
    await sleep(220);
    const t = TRIPS.find((x) => x.id === id);
    if (!t) throw new Error("Trip not found");
    return t;
  },

  async *planTrip(intent, opts = {}): AsyncGenerator<PlanEvent> {
    const { scenario = "success", signal } = opts;
    const trip = matchTrip(intent);
    const allStops = trip.days.flatMap((d) => d.stops);

    if (scenario === "offline") {
      await sleep(600, signal);
      yield { type: "error", code: "offline",
        message: "No connection. Rahgir needs the network to trace a route." };
      return;
    }

    // 1 · Route agent
    yield { type: "agent", agent: "route", status: "running", message: "Tracing the highway" };
    await sleep(900, signal);

    if (scenario === "no_route") {
      yield { type: "agent", agent: "route", status: "failed", message: "No drivable road found" };
      yield { type: "error", code: "no_route",
        message: "No drivable route between those two places. Try a nearby town." };
      return;
    }

    yield { type: "route", polyline: trip.polyline, totalKm: trip.totalKm };
    yield { type: "agent", agent: "route", status: "done",
      message: `${trip.totalKm} km · ${Math.round(trip.totalDriveMin / 60)}h drive` };

    // 2 · The discovery agents, in sequence so their work is legible
    for (const a of AGENTS.filter((x) => x.id !== "route")) {
      // The failure scenario kills the discovery agent mid-flight.
      if (scenario === "agent_failure" && a.id === "places") {
        yield { type: "agent", agent: a.id, status: "running", message: a.verb };
        await sleep(1100, signal);
        yield { type: "agent", agent: a.id, status: "failed",
          message: "Food agent timed out — showing the plan without dhaba picks" };
        continue;
      }

      yield { type: "agent", agent: a.id, status: "running", message: a.verb };
      await sleep(700, signal);

      const mine = allStops.filter((s) => s.agent === a.id);
      for (const s of mine) {
        await sleep(420, signal);
        yield { type: "found", agent: a.id, label: s.name };
        yield { type: "partial", stop: s };
      }
      await sleep(260, signal);
      yield { type: "agent", agent: a.id, status: "done",
        message: mine.length ? `${mine.length} found` : "nothing worth stopping for" };
    }

    await sleep(400, signal);

    // Degraded result: drop the failed discovery agent's contributions.
    const finalTrip: Trip =
      scenario === "agent_failure"
        ? {
            ...trip,
            days: trip.days.map((d) => ({
              ...d, stops: d.stops.filter((s) => s.agent !== "places"),
            })),
          }
        : trip;

    yield { type: "done", trip: finalTrip };
  },
};

/* ── Real backend implementation (activated by VITE_API_BASE) ───────────── */

/**
 * Parse a free-text intent into the backend's TripRequest.
 * The landing screen composes "From to To, details", so we split on that and
 * pull out any budget / days / vibe hints the traveller typed.
 */
export function parseIntent(intent: string) {
  const [routePart, ...rest] = intent.split(",");
  const details = rest.join(",").trim();
  const m = routePart.match(/^\s*(.+?)\s+(?:to|se|→|->)\s+(.+?)\s*$/i);
  const start = (m?.[1] ?? routePart).trim();
  const destination = (m?.[2] ?? "").trim();

  const themes: string[] = [];
  const d = details.toLowerCase();
  if (/khana|food|dhaba|eat|cuisine|kachori|thali/.test(d)) themes.push("foodie");
  if (/heritage|fort|history|temple|monument|historic/.test(d)) themes.push("heritage");
  if (/nature|scenic|lake|mountain|park/.test(d)) themes.push("nature");
  if (/spiritual|religious|mandir/.test(d)) themes.push("religious");

  const budget = details.match(/budget\s*(\d{3,6})/i);

  return {
    start,
    destination,
    detour_budget_min: budget ? Math.min(300, Math.round(Number(budget[1]) / 50)) : 120,
    themes: themes.length ? themes : ["balanced"],
    _budgetInr: budget ? Number(budget[1]) : undefined,
  };
}

export const httpApi: RahgirApi = {
  async listTrips() {
    return []; // backend has no list endpoint yet
  },

  async getTrip(id) {
    const r = await fetch(`${BASE}/trip/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(`getTrip failed (${r.status})`);
    return adaptTrip((await r.json()) as BeTrip);
  },

  async *planTrip(intent, opts = {}) {
    const parsed = parseIntent(intent);
    if (!parsed.destination) {
      yield { type: "error", code: "unknown", message: "Tell Rahgir where you're going." };
      return;
    }

    let r: Response;
    try {
      r = await fetch(`${BASE}/trip/plan/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: parsed.start,
          destination: parsed.destination,
          detour_budget_min: parsed.detour_budget_min,
          themes: parsed.themes,
        }),
        signal: opts.signal,
      });
    } catch {
      yield { type: "error", code: "offline",
        message: "Can't reach Rahgir's planner. Check the connection." };
      return;
    }

    if (!r.ok || !r.body) {
      let detail = `Planning failed (${r.status}).`;
      try {
        const b = await r.json();
        if (typeof b?.detail === "string") detail = b.detail;
      } catch { /* keep default */ }
      yield { type: "error", code: r.status === 429 ? "unknown" : "agent_failed", message: detail };
      return;
    }

    // NDJSON: one event per line, emitted as each LangGraph node completes.
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        let raw: Record<string, unknown>;
        try { raw = JSON.parse(t); } catch { continue; }

        switch (raw.type) {
          case "route":
            yield {
              type: "route",
              polyline: (raw.polyline as { lat: number; lon: number }[]).map(
                (p) => ({ lat: p.lat, lng: p.lon }),
              ),
              totalKm: Math.round(raw.totalKm as number),
            };
            break;
          case "partial":
            yield { type: "partial", stop: adaptPartial(raw.stop as never) };
            break;
          case "done": {
            const trip = adaptTrip(raw.trip as BeTrip);
            // Honour a budget the traveller actually typed.
            if (parsed._budgetInr) trip.budgetInr = parsed._budgetInr;
            yield { type: "done", trip };
            break;
          }
          default:
            yield raw as unknown as PlanEvent; // agent / error pass straight through
        }
      }
    }
  },
};

export const api: RahgirApi = BASE ? httpApi : mockApi;
export type { Scenario };
