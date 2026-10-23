import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, RotateCw, WifiOff } from "lucide-react";
import { api } from "@/api/client";
import type { LatLng, PlanErrorCode, Stop, Trip } from "@/api/types";
import { Button, Card, Chip, LiveStatus } from "@/components/ui/primitives";
import { MilestoneMarker } from "@/components/ui/Milestone";
import { RouteLine } from "@/components/RouteLine";
import { AgentTrace, initialAgentStates, type AgentState } from "@/components/AgentTrace";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AgentId } from "@/api/types";
import { usePrefersReducedMotion } from "@/hooks/useTheme";

type Phase = "planning" | "ready" | "error";

export default function Planning() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const intent = params.get("intent") ?? "";

  const [agents, setAgents] = useState<Record<AgentId, AgentState>>(initialAgentStates);
  const [stops, setStops] = useState<Stop[]>([]);
  const [polyline, setPolyline] = useState<LatLng[]>([]);
  const [totalKm, setTotalKm] = useState<number | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [phase, setPhase] = useState<Phase>("planning");
  const [error, setError] = useState<{ code: PlanErrorCode; message: string } | null>(null);
  const [status, setStatus] = useState("Planning your drive.");
  const abortRef = useRef<AbortController | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!intent) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let cancelled = false;

    // reset for a retry
    setAgents(initialAgentStates());
    setStops([]); setPolyline([]); setTotalKm(null);
    setTrip(null); setError(null); setPhase("planning");
    setStatus("Planning your drive.");

    (async () => {
      try {
        for await (const ev of api.planTrip(intent, { signal: ctrl.signal })) {
          if (cancelled) return;
          switch (ev.type) {
            case "agent":
              setAgents((s) => ({ ...s, [ev.agent]: { status: ev.status, message: ev.message } }));
              if (ev.status === "running") setStatus(`${ev.message}…`);
              break;
            case "route":
              setPolyline(ev.polyline);
              setTotalKm(ev.totalKm);
              break;
            case "partial":
              setStops((s) => (s.some((x) => x.id === ev.stop.id) ? s : [...s, ev.stop]));
              break;
            case "done":
              setTrip(ev.trip);
              setPhase("ready");
              setStatus(
                `Plan ready. ${ev.trip.days.flatMap((d) => d.stops).length} stops over ` +
                `${ev.trip.totalKm} kilometres.`,
              );
              break;
            case "error":
              setError({ code: ev.code, message: ev.message });
              setPhase("error");
              setStatus(`Planning failed. ${ev.message}`);
              break;
          }
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError" || cancelled) return;
        setError({ code: "unknown", message: (e as Error)?.message ?? "Something went wrong." });
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [intent, attempt]);

  const ordered = [...stops].sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm);

  return (
    <div className="min-h-dvh px-5 py-6 sm:px-8">
      {/* One atomic live region for the whole stream (UX: live badge rule). */}
      <LiveStatus message={status} />

      <div className="mx-auto w-full max-w-[1080px]">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              <span className="sign-caps text-[11px]">Change route</span>
            </Link>
          </Button>
          <ThemeToggle />
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="sign-caps text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
              {phase === "ready" ? "Plan ready" : phase === "error" ? "Could not plan" : "Planning"}
            </p>
            <h1 className="mt-1 text-[clamp(1.8rem,4.5vw,3rem)]" style={{ color: "var(--color-foreground)" }}>
              {intent.split(",")[0]}
            </h1>
          </div>
          {totalKm !== null && (
            <div className="flex items-center gap-2">
              <Chip tone="route">
                <span className="tabular font-medium">{totalKm} km</span>
              </Chip>
              {trip && (
                <Chip tone="neutral">
                  <span className="tabular">
                    {Math.floor(trip.totalDriveMin / 60)}h {trip.totalDriveMin % 60}m drive
                  </span>
                </Chip>
              )}
            </div>
          )}
        </div>

        {/* ── Error states ───────────────────────────────────────────────── */}
        {phase === "error" && error && (
          <Card className="mt-8 p-6" raised>
            <div className="flex items-start gap-3">
              {error.code === "offline" ? (
                <WifiOff className="mt-0.5 size-5 shrink-0" style={{ color: "var(--color-destructive)" }} />
              ) : (
                <span
                  className="mt-1 size-3 shrink-0 rounded-full"
                  style={{ background: "var(--color-destructive)" }}
                />
              )}
              <div className="min-w-0">
                <h2 className="text-[1.25rem]" style={{ color: "var(--color-foreground)" }}>
                  {error.code === "no_route" && "No drivable route"}
                  {error.code === "offline" && "Can't reach the planner"}
                  {error.code === "agent_failed" && "The planner stumbled"}
                  {error.code === "unknown" && "Something went wrong"}
                </h2>
                <p className="mt-1 text-[0.9rem]" style={{ color: "var(--color-muted-foreground)" }}>
                  {error.message}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => setAttempt((n) => n + 1)}>
                    <RotateCw className="size-4" />
                    <span className="sign-caps text-[12px]">Try again</span>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/"><span className="sign-caps text-[12px]">Change route</span></Link>
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {phase !== "error" && (
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,360px)_1fr]">
            {/* ── The agent trace: the differentiator ──────────────────── */}
            <section aria-label="Planning progress">
              <AgentTrace states={agents} />

              {phase === "ready" && trip && (
                <motion.div
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <Button
                    className="w-full"
                    style={{ minHeight: 52 }}
                    onClick={() => navigate(`/itinerary?trip=${trip.id}`)}
                  >
                    <span className="sign-caps text-[13px]">Open the itinerary</span>
                    <ArrowRight className="size-4" />
                  </Button>
                  <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-muted-foreground)" }}>
                    Costs are estimated from distance — the planner returns route and
                    stops, not prices.
                  </p>
                </motion.div>
              )}
            </section>

            {/* ── The road filling in as stops are found ───────────────── */}
            <section aria-label="Stops found so far" className="min-w-0">
              {polyline.length > 1 && (
                <Card className="overflow-hidden p-4">
                  <RouteLine
                    points={polyline}
                    width={900}
                    height={200}
                    className="h-[180px] w-full"
                  />
                </Card>
              )}

              <div className="mt-5 flex items-baseline justify-between">
                <span className="sign-caps text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
                  Stops found
                </span>
                <span className="sign-caps tabular text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
                  {ordered.length}
                </span>
              </div>

              {ordered.length === 0 ? (
                <p className="mt-4 text-[0.9rem]" style={{ color: "var(--color-muted-foreground)" }}>
                  {phase === "ready"
                    ? "No stops matched your detour budget on this route."
                    : "Looking along the highway…"}
                </p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-3">
                  {ordered.map((s, i) => (
                    <motion.li
                      key={s.id}
                      initial={reduced ? false : { opacity: 0, y: 12, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        duration: 0.3,
                        delay: Math.min(i * 0.04, 0.3),
                        ease: [0.25, 0.46, 0.45, 0.94],
                      }}
                      className="flex flex-col items-center gap-1"
                      style={{ width: 92 }}
                    >
                      <MilestoneMarker
                        place={s.name}
                        km={s.distanceFromStartKm}
                        tone={s.kind === "food" ? "marker" : "band"}
                        size="sm"
                      />
                      <span
                        className="w-full truncate text-center text-[0.6875rem]"
                        style={{ color: "var(--color-muted-foreground)" }}
                        title={s.name}
                      >
                        {s.name}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
