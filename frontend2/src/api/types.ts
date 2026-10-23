/**
 * Rahgir domain model — the single source of truth for the UI.
 * The mock layer and the real FastAPI client both satisfy `RahgirApi`,
 * so screens never know which one they are talking to.
 */

export type LatLng = { lat: number; lng: number };

export type StopKind =
  | "origin"
  | "destination"
  | "fuel"
  | "food"
  | "sight"
  | "rest"
  | "stay";

/**
 * The five REAL LangGraph nodes in the FastAPI backend, in pipeline order.
 * The agent trace shows observed backend progress — it is not simulated.
 */
export type AgentId = "route" | "sample" | "places" | "rank" | "narrator";

export type AgentStatus = "idle" | "running" | "done" | "failed";

export interface AgentMeta {
  id: AgentId;
  /** Latin label */
  label: string;
  /** Devanagari label — a first-class name, not a translation caption. */
  labelHi: string;
  /** What this agent is doing, in the user's language of travel. */
  verb: string;
}

export interface Alternative {
  id: string;
  name: string;
  detourMin: number;
  costInr: number;
  note: string;
}

export interface Stop {
  id: string;
  kind: StopKind;
  name: string;
  nameHi?: string;
  subtitle: string;
  coord: LatLng;
  /** Distance from trip origin — the milestone number. */
  distanceFromStartKm: number;
  /** Extra minutes vs. staying on the highway. */
  detourMin: number;
  /** How long you'd stop here. */
  dwellMin: number;
  costInr: number;
  /** Why the agent chose this. Shown verbatim — never invented in the UI. */
  why: string;
  timingAdvice?: string;
  photos: string[];
  rating?: number;
  /** Which agent proposed it (drives provenance chips). */
  agent: AgentId;
  alternatives: Alternative[];
}

export interface Day {
  index: number;
  label: string;
  labelHi: string;
  startTime: string;
  endTime: string;
  distanceKm: number;
  driveMin: number;
  stops: Stop[];
}

export interface Trip {
  id: string;
  from: string;
  fromHi: string;
  to: string;
  toHi: string;
  intent: string;
  days: Day[];
  totalKm: number;
  totalDriveMin: number;
  fuelLitres: number;
  fuelCostInr: number;
  tollsInr: number;
  foodInr: number;
  stayInr: number;
  budgetInr: number;
  /** Route geometry for the map canvas. */
  polyline: LatLng[];
  /**
   * True when money/dwell figures were derived client-side from distance,
   * because the backend does not return them. The UI must label these "est.".
   */
  estimated?: boolean;
}

/* ── Streaming plan events ─────────────────────────────────────────────── */

export type PlanEvent =
  | { type: "agent"; agent: AgentId; status: AgentStatus; message: string }
  | { type: "found"; agent: AgentId; label: string }
  | { type: "route"; polyline: LatLng[]; totalKm: number }
  | { type: "partial"; stop: Stop }
  | { type: "done"; trip: Trip }
  | { type: "error"; code: PlanErrorCode; message: string; agent?: AgentId };

export type PlanErrorCode =
  | "no_route"
  | "offline"
  | "agent_failed"
  | "unknown";

/** Scenario switch so every UI state is reachable without a backend. */
export type Scenario =
  | "success"
  | "agent_failure"   // one agent dies, plan still completes (degraded)
  | "no_route"
  | "offline";

export interface RahgirApi {
  listTrips(): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip>;
  /** Streams agent progress, then the finished trip. */
  planTrip(intent: string, opts?: { scenario?: Scenario; signal?: AbortSignal }):
    AsyncGenerator<PlanEvent>;
}
