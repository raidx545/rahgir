import { useMemo, useState, useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  Calendar,
  Car,
  UtensilsCrossed,
  Landmark,
  Layers,
  LocateFixed,
  SlidersHorizontal,
  Navigation,
  Loader2,
  Star,
  Share2,
  Check,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Map as LeafletMap } from "leaflet";
import RouteMap from "../components/RouteMap";
import ChatBox from "../components/ChatBox";
import { useTrip, setTrip } from "../store";
import { demoTrip } from "../demo";
import { recordTrip, toggleSave, useTrips } from "../trips";
import { stagger, item, pop } from "../motion";
import {
  fmtTime,
  fmtDuration,
  prettyKind,
  isFoodKind,
  stopPhoto,
  getTrip,
  type RankedPlace,
  type TripResponse,
} from "../api";

export default function Dashboard() {
  const trip = useTrip();
  const [params] = useSearchParams();
  const tripId = params.get("trip");
  const isDemo = params.get("demo") === "1";
  const [loaded, setLoaded] = useState<TripResponse | null>(null);
  const [error, setError] = useState("");

  // If arriving via a share link (?trip=<id>) with no trip in memory, fetch it.
  useEffect(() => {
    if (trip || isDemo || !tripId) return;
    let cancelled = false;
    setError("");
    getTrip(tripId)
      .then((t) => {
        if (cancelled) return;
        setLoaded(t);
        setTrip(t);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load."));
    return () => {
      cancelled = true;
    };
  }, [trip, tripId, isDemo]);

  if (trip) return <DashboardView trip={trip} />;
  if (isDemo) return <DashboardView trip={demoTrip} />;
  if (loaded) return <DashboardView trip={loaded} />;
  if (tripId) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-muted gap-3">
        {error ? (
          <>
            <p className="text-rust font-medium">{error}</p>
            <a href="/" className="text-rust text-sm underline">
              Plan a new journey
            </a>
          </>
        ) : (
          <>
            <Loader2 className="size-6 animate-spin text-rust" />
            <p>Loading your journey…</p>
          </>
        )}
      </div>
    );
  }
  return <Navigate to="/" replace />;
}

function DashboardView({ trip }: { trip: TripResponse }) {
  const { request, itinerary, total_distance_km, total_duration_min } = trip;
  const departure = request.departure ? new Date(request.departure) : new Date();
  const arrival = new Date(departure.getTime() + total_duration_min * 60_000);

  // map controls + next-stop state
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [tile, setTile] = useState<"standard" | "terrain">("standard");
  const [foodOnly, setFoodOnly] = useState(false);
  const [nextIdx, setNextIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Record this trip in local history so Trips/Saved/Assistant can find it.
  useEffect(() => {
    recordTrip(trip);
  }, [trip.trip_id]);

  const savedTrips = useTrips();
  const isSaved = savedTrips.find((t) => t.trip_id === trip.trip_id)?.saved ?? false;
  const shareable = trip.trip_id && trip.trip_id !== "demo";

  function share() {
    const url = `${window.location.origin}/dashboard?trip=${trip.trip_id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const visibleStops = useMemo(
    () => (foodOnly ? itinerary.stops.filter((s) => isFoodKind(s.kinds)) : itinerary.stops),
    [itinerary.stops, foodOnly],
  );
  const nextStop = itinerary.stops[nextIdx];

  const dateRange = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const d1 = departure.toLocaleDateString([], opts);
    const d2 = arrival.toLocaleDateString([], opts);
    return d1 === d2 ? d1 : `${d1} – ${d2}`;
  }, [request.departure, total_duration_min]);

  function recenter() {
    if (!map) return;
    const pts = trip.polyline.length
      ? trip.polyline.map((p) => [p.lat, p.lon] as [number, number])
      : [
          [trip.start_point.lat, trip.start_point.lon] as [number, number],
          [trip.end_point.lat, trip.end_point.lon] as [number, number],
        ];
    map.fitBounds(pts, { padding: [60, 60] });
  }

  function openDirections(place: RankedPlace) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${place.point.lat},${place.point.lon}`;
    window.open(url, "_blank", "noopener");
  }

  function selectStop(xid: string) {
    setSelected(xid);
    const s = itinerary.stops.find((x) => x.xid === xid);
    if (s && map) map.panTo([s.point.lat, s.point.lon], { animate: true });
    // bring the matching timeline card into view
    document
      .getElementById(`stop-${xid}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return (
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left: Itinerary timeline (40%) */}
        <section className="w-2/5 min-w-[380px] flex flex-col border-r border-line bg-paper">
          {/* Sticky header */}
          <div className="px-6 pt-4 pb-3 border-b border-line">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="kicker">Current Journey</p>
                <h1 className="text-ink text-[32px] leading-10 font-semibold mt-1">
                  {request.start} to {request.destination}
                </h1>
              </div>
              {shareable && (
                <div className="flex items-center gap-1 shrink-0 pt-1">
                  <button
                    onClick={() => toggleSave(trip.trip_id)}
                    title={isSaved ? "Saved" : "Save trip"}
                    className="p-2 rounded-lg hover:bg-sand transition"
                  >
                    <Star className={`size-[18px] ${isSaved ? "fill-rust text-rust" : "text-muted"}`} />
                  </button>
                  <button
                    onClick={share}
                    title="Copy share link"
                    className="p-2 rounded-lg hover:bg-sand transition text-muted"
                  >
                    {copied ? <Check className="size-[18px] text-forest" /> : <Share2 className="size-[18px]" />}
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 text-muted text-[14px]">
              <Calendar className="size-3.5" />
              <span>
                {dateRange} • {Math.round(total_distance_km)} km •{" "}
                {fmtDuration(total_duration_min)}
              </span>
            </div>
          </div>

          {/* Timeline (scrolls) */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {itinerary.intro && (
              <p className="text-muted text-[15px] leading-6 italic mb-6">
                {itinerary.intro}
              </p>
            )}
            <motion.div
              className="relative"
              variants={stagger}
              initial="initial"
              animate="animate"
            >
              {/* vertical line */}
              <div className="absolute left-[7px] top-3 bottom-3 w-px border-l-2 border-dashed border-field" />

              <TimelineNode
                node
                time={`${fmtTime(departure.toISOString())} • Departure`}
                title={request.start}
              />

              {itinerary.stops.length === 0 && (
                <div className="ml-8 my-4 text-muted text-[14px] bg-sand border border-line rounded-lg p-4">
                  No stops matched your detour budget along this route. Try a
                  larger budget or a different vibe.
                </div>
              )}

              {itinerary.stops.length > 0 && visibleStops.length === 0 && (
                <div className="ml-8 my-4 text-muted text-[14px] bg-sand border border-line rounded-lg p-4">
                  No food stops on this route. Turn off the food filter to see all
                  stops.
                </div>
              )}

              {visibleStops.map((s) => (
                <StopItem
                  key={s.xid}
                  stop={s}
                  selected={s.xid === selected}
                  onSelect={() => selectStop(s.xid)}
                />
              ))}

              <TimelineNode
                node="dest"
                time={`${fmtTime(arrival.toISOString())} • Arrival`}
                title={request.destination}
                subtitle="Your destination awaits."
              />
            </motion.div>

            {trip.warnings.length > 0 && (
              <div className="mt-6 text-[12px] text-muted/80 bg-sand border border-line rounded-lg p-3">
                {trip.warnings.map((w, i) => (
                  <p key={i}>• {w}</p>
                ))}
              </div>
            )}
          </div>

          <ChatBox
            tripId={trip.trip_id}
            greeting={`You're on your way to ${request.destination}. Ask me about any stop along the route.`}
            className="border-t border-line px-4 py-4 bg-paper"
          />
        </section>

        {/* Right: Map (60%) */}
        <section className="flex-1 relative">
          <RouteMap
            trip={trip}
            stops={visibleStops}
            tile={tile}
            onMap={setMap}
            selectedId={selected}
            onSelectStop={selectStop}
          />

          {/* Floating controls */}
          <div className="absolute top-6 right-6 flex flex-col gap-3 z-[500]">
            <FabButton
              icon={Layers}
              title="Toggle map style"
              active={tile === "terrain"}
              onClick={() => setTile((t) => (t === "standard" ? "terrain" : "standard"))}
            />
            <FabButton icon={LocateFixed} title="Recenter route" onClick={recenter} />
            <FabButton
              icon={SlidersHorizontal}
              title="Food stops only"
              accent
              active={foodOnly}
              onClick={() => setFoodOnly((v) => !v)}
            />
          </div>

          {/* Next-stop overlay card */}
          {nextStop && (
            <motion.div
              key={nextStop.xid}
              variants={pop}
              initial="initial"
              animate="animate"
              className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[420px] max-w-[90%] bg-white/95 backdrop-blur border border-line rounded-xl shadow-glass p-4 flex items-center justify-between z-[500]"
            >
              <div className="min-w-0">
                <p className="kicker text-[10px]">Next Stop</p>
                <p className="font-serif font-semibold text-ink text-[18px] leading-6 truncate">
                  {nextStop.name}
                </p>
                <p className="text-rust text-[13px] font-medium mt-0.5">
                  {nextStop.dist_to_route_km.toFixed(1)} km off route •{" "}
                  {prettyKind(nextStop.kinds)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => openDirections(nextStop)}
                  title="Directions (Google Maps)"
                  className="size-9 rounded-full border border-field flex items-center justify-center text-ink hover:bg-sand transition"
                >
                  <Navigation className="size-4" />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setNextIdx((i) => i + 1)}
                  className="bg-ink text-white rounded-full px-4 py-2 text-[14px] font-semibold hover:brightness-125 transition"
                >
                  Skip Stop
                </motion.button>
              </div>
            </motion.div>
          )}
        </section>
      </div>
  );
}

/* --- timeline pieces --- */

function TimelineNode({
  time,
  title,
  subtitle,
  node,
}: {
  time: string;
  title: string;
  subtitle?: string;
  node: boolean | "dest";
}) {
  return (
    <motion.div variants={item} className="relative pl-8 pb-8">
      <span
        className={[
          "absolute left-0 top-1 size-4 rounded-full bg-paper",
          node === "dest"
            ? "border-[5px] border-ink"
            : "border-2 border-field",
        ].join(" ")}
      />
      <p className="text-muted text-[12px] font-medium tracking-[0.03em] uppercase">
        {time}
      </p>
      <h3
        className={[
          "text-ink mt-1 leading-7",
          node === "dest" ? "text-[24px] font-semibold" : "text-[20px]",
        ].join(" ")}
      >
        {title}
      </h3>
      {subtitle && (
        <p className="text-muted text-[14px] leading-5 mt-1">{subtitle}</p>
      )}
    </motion.div>
  );
}

function StopItem({
  stop,
  selected = false,
  onSelect,
}: {
  stop: RankedPlace;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const isFood = isFoodKind(stop.kinds);
  const kind = prettyKind(stop.kinds);
  const photo = stopPhoto(stop, 400);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = photo && !imgFailed;
  return (
    <motion.div id={`stop-${stop.xid}`} variants={item} className="relative pl-8 pb-8 scroll-mt-4">
      <span
        className={[
          "absolute left-0 top-1 size-4 rounded-full bg-paper border-2 border-rust transition-all",
          selected ? "ring-4 ring-rust/40 scale-110" : "ring-4 ring-rust/10",
        ].join(" ")}
      />
      <p className="flex items-center gap-1.5 text-rust text-[12px] font-medium tracking-[0.03em] uppercase">
        {isFood ? <UtensilsCrossed className="size-3" /> : <Car className="size-3" />}
        {stop.eta ? `${fmtTime(stop.eta)} • ` : ""}
        {isFood ? "Quick Bite" : "Pitstop"}
      </p>
      <h3 className="text-ink text-[20px] leading-7 mt-1">{stop.name}</h3>

      {/* Famous For card */}
      <button
        type="button"
        onClick={onSelect}
        className={[
          "mt-3 w-full text-left bg-white border rounded-xl shadow-subtle p-4 flex gap-4 transition-all cursor-pointer hover:border-rust/50",
          selected ? "border-rust ring-2 ring-rust/30" : "border-line",
        ].join(" ")}
      >
        <div className="size-20 shrink-0 rounded-lg bg-sand border border-line overflow-hidden flex items-center justify-center text-rust">
          {showImg ? (
            <img
              src={photo}
              alt={stop.name}
              loading="lazy"
              className="size-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : isFood ? (
            <UtensilsCrossed className="size-8" />
          ) : (
            <Landmark className="size-8" />
          )}
        </div>
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-rust/10 text-rust text-[11px] font-semibold uppercase tracking-[0.05em] px-2 py-0.5">
            {isFood ? "Must-Try" : `${kind} Vibe`}
          </span>
          <p className="text-muted text-[13px] leading-5 mt-2 line-clamp-4">
            {stop.why ||
              `A recommended ${kind.toLowerCase()} stop, ${stop.dist_to_route_km.toFixed(
                1,
              )} km off your route.`}
          </p>
        </div>
      </button>
    </motion.div>
  );
}


function FabButton({
  icon: Icon,
  accent,
  active,
  title,
  onClick,
}: {
  icon: typeof Layers;
  accent?: boolean;
  active?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  const base = "size-10 rounded-full flex items-center justify-center shadow-card transition";
  const style = accent
    ? active
      ? "bg-rust text-white ring-2 ring-rust/40 brightness-110"
      : "bg-rust text-white hover:brightness-110"
    : active
      ? "bg-ink text-white"
      : "bg-white text-ink border border-line hover:bg-sand";
  return (
    <button title={title} onClick={onClick} className={[base, style].join(" ")}>
      <Icon className="size-[18px]" />
    </button>
  );
}
