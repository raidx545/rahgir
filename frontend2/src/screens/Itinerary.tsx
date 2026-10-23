import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ChevronDown, ChevronUp, Clock, Fuel, IndianRupee,
  Landmark, Loader2, Minus, Plus, RotateCcw, Trash2, UtensilsCrossed,
  BedDouble, ParkingCircle, MapPin,
} from "lucide-react";
import { api } from "@/api/client";
import type { Stop, StopKind, Trip } from "@/api/types";
import { Button, Card, Chip, LiveStatus, Skeleton } from "@/components/ui/primitives";
import { MilestoneMarker } from "@/components/ui/Milestone";
import { TripMap } from "@/components/TripMap";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePrefersReducedMotion } from "@/hooks/useTheme";

const KIND_ICON: Record<StopKind, typeof Clock> = {
  origin: MapPin, destination: MapPin, fuel: Fuel, food: UtensilsCrossed,
  sight: Landmark, rest: ParkingCircle, stay: BedDouble,
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const hhmm = (min: number) => `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;

export default function Itinerary() {
  const [params] = useSearchParams();
  const tripId = params.get("trip");
  const reduced = usePrefersReducedMotion();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [removed, setRemoved] = useState<Stop[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    if (!tripId) { setError("No trip specified."); return; }
    let cancelled = false;
    api.getTrip(tripId)
      .then((t) => {
        if (cancelled) return;
        setTrip(t);
        setStops(t.days.flatMap((d) => d.stops));
      })
      .catch((e) => !cancelled && setError(e?.message ?? "Could not load this trip."));
    return () => { cancelled = true; };
  }, [tripId]);

  /* ── Live totals. Removing or re-timing a stop changes these immediately. ── */
  const totals = useMemo(() => {
    if (!trip) return null;
    const detourMin = stops.reduce((n, s) => n + s.detourMin, 0);
    const dwellMin = stops.reduce((n, s) => n + s.dwellMin, 0);
    const stopCost = stops.reduce((n, s) => n + s.costInr, 0);
    return {
      detourMin, dwellMin,
      totalMin: trip.totalDriveMin + detourMin + dwellMin,
      cost: trip.fuelCostInr + trip.tollsInr + stopCost,
      stopCost,
    };
  }, [trip, stops]);

  /* Baseline = the plan as returned, so deltas are always vs. the original. */
  const baseline = useMemo(() => {
    if (!trip) return null;
    const all = trip.days.flatMap((d) => d.stops);
    const detourMin = all.reduce((n, s) => n + s.detourMin, 0);
    const dwellMin = all.reduce((n, s) => n + s.dwellMin, 0);
    return {
      totalMin: trip.totalDriveMin + detourMin + dwellMin,
      cost: trip.fuelCostInr + trip.tollsInr + all.reduce((n, s) => n + s.costInr, 0),
    };
  }, [trip]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stops.length) return;
    const next = [...stops];
    [next[i], next[j]] = [next[j], next[i]];
    setStops(next);
    // Wording matches the button labels: earlier = up the list, later = down.
    setAnnounce(
      `${next[j].name} moved ${dir === -1 ? "earlier" : "later"}. Position ${j + 1} of ${next.length}.`,
    );
  };

  const remove = (s: Stop) => {
    setStops((cur) => cur.filter((x) => x.id !== s.id));
    setRemoved((cur) => [s, ...cur]);
    setSelected((cur) => (cur === s.id ? null : cur));
    setAnnounce(`${s.name} removed. ${inr(s.costInr)} and ${s.detourMin + s.dwellMin} minutes saved.`);
  };

  const restore = (s: Stop) => {
    setRemoved((cur) => cur.filter((x) => x.id !== s.id));
    setStops((cur) =>
      [...cur, s].sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm),
    );
    setAnnounce(`${s.name} added back to the plan.`);
  };

  const setDwell = (id: string, delta: number) => {
    setStops((cur) =>
      cur.map((s) =>
        s.id === id ? { ...s, dwellMin: Math.max(0, s.dwellMin + delta) } : s,
      ),
    );
  };

  /* ── States ─────────────────────────────────────────────────────────── */
  if (error) {
    return (
      <Shell>
        <Card className="p-6" raised>
          <h1 className="text-[1.3rem]">Couldn't open this trip</h1>
          <p className="mt-1 text-[0.9rem]" style={{ color: "var(--color-muted-foreground)" }}>{error}</p>
          <Button className="mt-4" asChild>
            <Link to="/"><span className="sign-caps text-[12px]">Plan a new drive</span></Link>
          </Button>
        </Card>
      </Shell>
    );
  }

  if (!trip || !totals || !baseline) {
    return (
      <Shell>
        <div className="flex items-center gap-2" style={{ color: "var(--color-muted-foreground)" }}>
          <Loader2 className="size-4 animate-spin" />
          <span className="sign-caps text-[11px]">Loading your plan</span>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <Skeleton className="h-[320px] w-full" />
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[86px] w-full" />)}
          </div>
        </div>
      </Shell>
    );
  }

  const dMin = totals.totalMin - baseline.totalMin;
  const dCost = totals.cost - baseline.cost;

  return (
    <Shell>
      <LiveStatus message={announce} />

      {/* Header + live summary */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="sign-caps text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
            Your itinerary
          </p>
          <h1 className="mt-1 text-[clamp(1.7rem,4vw,2.6rem)]">
            {trip.from} <span style={{ color: "var(--color-muted-foreground)" }}>→</span> {trip.to}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="route"><span className="tabular font-medium">{trip.totalKm} km</span></Chip>
          <Chip tone="neutral">
            <Clock className="size-3" />
            <span className="tabular">{hhmm(totals.totalMin)}</span>
            {dMin !== 0 && (
              <span className="tabular font-semibold"
                style={{ color: dMin < 0 ? "var(--color-primary)" : "var(--color-marker)" }}>
                {dMin > 0 ? "+" : "−"}{hhmm(Math.abs(dMin))}
              </span>
            )}
          </Chip>
          <Chip tone="band">
            <IndianRupee className="size-3" />
            <span className="tabular font-semibold">{Math.round(totals.cost).toLocaleString("en-IN")}</span>
            {dCost !== 0 && (
              <span className="tabular">{dCost > 0 ? "+" : "−"}{inr(Math.abs(dCost))}</span>
            )}
          </Chip>
        </div>
      </div>

      {trip.estimated && (
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-muted-foreground)" }}>
          Costs and stop durations are <strong>estimated</strong> from distance — the
          planner returns the route and the stops, not prices.
        </p>
      )}

      {/* Map + timeline */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="overflow-hidden lg:sticky lg:top-6 lg:h-[calc(100dvh-8rem)]">
          <TripMap
            polyline={trip.polyline}
            stops={stops}
            selectedId={selected}
            onSelect={setSelected}
            className="h-[320px] w-full lg:h-full"
          />
        </Card>

        <section aria-label="Stops, in travel order">
          <div className="flex items-baseline justify-between">
            <span className="sign-caps text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
              {stops.length} stops
            </span>
            <span className="sign-caps text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
              Drive {hhmm(trip.totalDriveMin)} + stops {hhmm(totals.detourMin + totals.dwellMin)}
            </span>
          </div>

          <ol className="mt-3 flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {stops.map((s, i) => (
                <motion.li
                  key={s.id}
                  layout={!reduced}
                  initial={reduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0, x: -20, height: 0, marginBottom: -12 }}
                  transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <StopRow
                    stop={s}
                    index={i}
                    count={stops.length}
                    active={selected === s.id}
                    onSelect={() => setSelected(s.id === selected ? null : s.id)}
                    onUp={() => move(i, -1)}
                    onDown={() => move(i, 1)}
                    onRemove={() => remove(s)}
                    onDwell={(d) => setDwell(s.id, d)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>

          {removed.length > 0 && (
            <div className="mt-6">
              <span className="sign-caps text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
                Removed
              </span>
              <ul className="mt-2 flex flex-col gap-2">
                {removed.map((s) => (
                  <li key={s.id}
                    className="flex items-center justify-between gap-3 rounded-[var(--p-radius-md)] px-3 py-2"
                    style={{ background: "var(--color-surface-sunken)" }}>
                    <span className="truncate text-[0.875rem]" style={{ color: "var(--color-muted-foreground)" }}>
                      {s.name}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => restore(s)}>
                      <RotateCcw className="size-3.5" />
                      <span className="sign-caps text-[11px]">Add back</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Budget breakdown */}
          <Card className="mt-6 p-4">
            <span className="sign-caps text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
              Budget · estimated
            </span>
            <dl className="mt-3 flex flex-col gap-2 text-[0.875rem]">
              <Row label={`Fuel · ${trip.fuelLitres} L`} value={inr(trip.fuelCostInr)} />
              <Row label="Tolls" value={inr(trip.tollsInr)} />
              <Row label="Stops" value={inr(totals.stopCost)} />
              <div className="mt-1 border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
                <Row label="Total" value={inr(totals.cost)} strong />
              </div>
            </dl>
          </Card>
        </section>
      </div>
    </Shell>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt style={{ color: strong ? "var(--color-foreground)" : "var(--color-muted-foreground)" }}>
        {label}
      </dt>
      <dd className="tabular" style={{ fontWeight: strong ? 700 : 500 }}>{value}</dd>
    </div>
  );
}

function StopRow({
  stop, index, count, active, onSelect, onUp, onDown, onRemove, onDwell,
}: {
  stop: Stop; index: number; count: number; active: boolean;
  onSelect: () => void; onUp: () => void; onDown: () => void;
  onRemove: () => void; onDwell: (d: number) => void;
}) {
  const Icon = KIND_ICON[stop.kind];
  const fixed = stop.kind === "origin" || stop.kind === "destination";

  return (
    <Card
      raised={active}
      className="p-3 transition-[border-color,box-shadow]"
      style={{ borderColor: active ? "var(--color-primary)" : undefined }}
    >
      <div className="flex gap-3">
        <button
          onClick={onSelect}
          aria-pressed={active}
          aria-label={`${stop.name}, ${stop.distanceFromStartKm} km from start. Show on map.`}
          className="flex-none cursor-pointer"
        >
          <MilestoneMarker
            place={stop.kind === "origin" ? "Start" : stop.kind === "destination" ? "End" : stop.subtitle}
            km={stop.distanceFromStartKm}
            size="sm"
            tone={stop.kind === "origin" ? "route" : stop.kind === "destination" ? "marker" : "band"}
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button onClick={onSelect} className="min-w-0 cursor-pointer text-left">
              <h3 className="truncate text-[1.05rem] leading-tight">{stop.name}</h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.75rem]"
                style={{ color: "var(--color-muted-foreground)" }}>
                <Icon className="size-3" />
                <span className="capitalize">{stop.kind}</span>
                {stop.detourMin > 0 && <span className="tabular">+{stop.detourMin} min detour</span>}
                {stop.costInr > 0 && <span className="tabular">{inr(stop.costInr)}</span>}
              </p>
            </button>

            {/* Reorder + remove: buttons, not drag-only (WCAG 2.2). */}
            {!fixed && (
              <div className="flex flex-none items-center gap-0.5">
                <IconBtn label={`Move ${stop.name} earlier`} onClick={onUp} disabled={index === 0}>
                  <ChevronUp className="size-4" />
                </IconBtn>
                <IconBtn label={`Move ${stop.name} later`} onClick={onDown} disabled={index === count - 1}>
                  <ChevronDown className="size-4" />
                </IconBtn>
                <IconBtn label={`Remove ${stop.name}`} onClick={onRemove} danger>
                  <Trash2 className="size-4" />
                </IconBtn>
              </div>
            )}
          </div>

          {stop.why && (
            <p className="mt-2 text-[0.8125rem] leading-5" style={{ color: "var(--color-muted-foreground)" }}>
              {stop.why}
            </p>
          )}

          {!fixed && (
            <div className="mt-2 flex items-center gap-2">
              <span className="sign-caps text-[10px]" style={{ color: "var(--color-muted-foreground)" }}>
                Stay
              </span>
              <IconBtn label={`Less time at ${stop.name}`} onClick={() => onDwell(-5)} small>
                <Minus className="size-3.5" />
              </IconBtn>
              <span className="tabular w-[52px] text-center text-[0.8125rem]">{stop.dwellMin} min</span>
              <IconBtn label={`More time at ${stop.name}`} onClick={() => onDwell(5)} small>
                <Plus className="size-3.5" />
              </IconBtn>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function IconBtn({
  children, label, onClick, disabled, danger, small,
}: {
  children: React.ReactNode; label: string; onClick: () => void;
  disabled?: boolean; danger?: boolean; small?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex cursor-pointer items-center justify-center rounded-[var(--p-radius-md)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        // 44px hit area even though the glyph is small (Touch UX rule).
        minWidth: small ? 32 : "var(--control-min)",
        minHeight: small ? 32 : "var(--control-min)",
        color: danger ? "var(--color-destructive)" : "var(--color-muted-foreground)",
      }}
    >
      {children}
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh px-5 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-[1240px]">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              <span className="sign-caps text-[11px]">New drive</span>
            </Link>
          </Button>
          <ThemeToggle />
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
