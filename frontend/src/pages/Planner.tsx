import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  LocateFixed,
  MapPin,
  Clock,
  Compass,
  ArrowRight,
  UtensilsCrossed,
  Landmark,
  Church,
  Mountain,
  Store,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { planTrip, autocomplete, type Theme, type Suggestion } from "../api";
import { setTrip } from "../store";
import { stagger, item, tapScale } from "../motion";

const VIBES: { id: Theme; label: string; icon: typeof UtensilsCrossed }[] = [
  { id: "foodie", label: "Foodie", icon: UtensilsCrossed },
  { id: "heritage", label: "Heritage", icon: Landmark },
  { id: "religious", label: "Spiritual", icon: Church },
  { id: "nature", label: "Nature", icon: Mountain },
  { id: "balanced", label: "Local Markets", icon: Store },
];

// Slider positions map to a detour budget in minutes.
const BUDGET_STOPS = [0, 30, 60, 90, 120, 180, 240];

function budgetLabel(min: number): string {
  if (min === 0) return "Direct";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `+${h}h ${m}m`;
  if (h) return `+${h} Hour${h > 1 ? "s" : ""}`;
  return `+${m} Mins`;
}

export default function Planner() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [start, setStart] = useState("Delhi");
  const [destination, setDestination] = useState(params.get("dest") ?? "Jaipur");
  const [departure, setDeparture] = useState("2024-05-15T08:00");
  const [budgetIdx, setBudgetIdx] = useState(4); // +2 Hours
  const [themes, setThemes] = useState<Set<Theme>>(new Set(["foodie", "heritage", "balanced"]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const budget = BUDGET_STOPS[budgetIdx];

  function toggleVibe(id: Theme) {
    setThemes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function onSubmit() {
    setError("");
    if (!start.trim() || !destination.trim()) {
      setError("Enter both a starting point and destination.");
      return;
    }
    setLoading(true);
    try {
      const selected = [...themes];
      const trip = await planTrip({
        start: start.trim(),
        destination: destination.trim(),
        departure: departure ? new Date(departure).toISOString() : null,
        detour_budget_min: budget,
        themes: selected.length ? selected : ["balanced"],
      });
      setTrip(trip);
      navigate("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-[768px] mx-auto">
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="relative bg-white border border-line rounded-xl shadow-card overflow-hidden p-10"
      >
        {/* decorative glow */}
        <div className="pointer-events-none absolute -right-24 -top-24 size-48 rounded-full bg-blob blur-3xl opacity-50" />

        {/* Heading */}
        <motion.div
          variants={item}
          className="relative text-center flex flex-col items-center gap-2 mb-10"
        >
            <h1 className="text-ink text-[32px] leading-10 font-semibold">
              Craft Your Journey
            </h1>
            <p className="text-muted text-[16px] leading-6 max-w-[512px]">
              Tell us where you're headed, and we'll uncover the hidden gems and
              local secrets along the way.
            </p>
        </motion.div>

        <motion.div variants={stagger} className="relative flex flex-col gap-8">
            {/* Location inputs */}
            <motion.div variants={item} className="flex flex-col sm:flex-row gap-6">
              <PlaceField
                icon={LocateFixed}
                label="Starting Point"
                value={start}
                onChange={setStart}
              />
              <PlaceField
                icon={MapPin}
                label="Destination"
                value={destination}
                onChange={setDestination}
              />
            </motion.div>

            {/* Departure */}
            <motion.div variants={item} className="max-w-[250px]">
              <Field icon={Clock} label="Departure">
                <input
                  type="datetime-local"
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value)}
                  className="w-full bg-transparent outline-none text-ink text-[16px] leading-6"
                />
              </Field>
            </motion.div>

            {/* Detour budget */}
            <motion.div variants={item} className="bg-sand border border-line rounded-xl p-6">
              <div className="flex items-end justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Compass className="size-5 text-rust" />
                    <h3 className="text-ink text-[20px] leading-6 font-semibold">
                      Detour Budget
                    </h3>
                  </div>
                  <p className="text-muted text-[14px] leading-5 mt-1">
                    How much extra time for exploration?
                  </p>
                </div>
                <span className="font-serif font-medium text-rust text-[24px] leading-8 whitespace-nowrap">
                  {budgetLabel(budget)}
                </span>
              </div>
              <div className="pt-6 pb-2">
                <input
                  type="range"
                  className="vibe-slider w-full"
                  min={0}
                  max={BUDGET_STOPS.length - 1}
                  step={1}
                  value={budgetIdx}
                  onChange={(e) => setBudgetIdx(Number(e.target.value))}
                />
                <div className="flex justify-between mt-3.5 text-muted text-[12px] font-medium tracking-[0.03em]">
                  <span>Direct Travel</span>
                  <span>Meandering Mode</span>
                </div>
              </div>
            </motion.div>

            {/* Choose your vibe */}
            <motion.div variants={item}>
              <h3 className="text-ink text-[20px] leading-6 font-semibold mb-4">
                Choose Your Vibe
              </h3>
              <div className="flex flex-wrap gap-3">
                {VIBES.map(({ id, label, icon: Icon }) => {
                  const active = themes.has(id);
                  return (
                    <motion.button
                      key={id}
                      onClick={() => toggleVibe(id)}
                      whileTap={tapScale}
                      className={[
                        "flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold tracking-[0.05em] border transition-colors",
                        active
                          ? "bg-forest border-forest text-white"
                          : "bg-white border-field text-muted hover:border-ink/40",
                      ].join(" ")}
                    >
                      <Icon className="size-[15px]" />
                      {label}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-rust text-[14px] font-medium bg-rust/5 border border-rust/20 rounded-lg px-4 py-3"
              >
                {error}
              </motion.div>
            )}

            {/* Action */}
            <motion.div variants={item} className="border-t border-line pt-6">
              <motion.button
                onClick={onSubmit}
                disabled={loading}
                whileTap={tapScale}
                whileHover={{ filter: "brightness(1.25)" }}
                className="inline-flex items-center gap-2 bg-ink text-white rounded-xl px-8 py-4 text-[16px] shadow-btn transition disabled:opacity-70 disabled:cursor-wait"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Uncovering the route…
                  </>
                ) : (
                  <>
                    Discover the Route
                    <ArrowRight className="size-4" />
                  </>
                )}
              </motion.button>
            </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex-1 flex items-center gap-3 bg-white border border-field rounded-lg px-4 py-3 cursor-text focus-within:border-ink/50 transition">
      <Icon className="size-5 text-rust shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="block text-muted text-[12px] font-medium tracking-[0.03em] leading-4">
          {label}
        </span>
        {children}
      </div>
    </label>
  );
}

/** A location input with debounced place-name suggestions. */
function PlaceField({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const skipFetch = useRef(false); // don't re-query right after choosing

  // Close on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
  }, []);

  function queryFor(v: string) {
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      abort.current?.abort();
      abort.current = new AbortController();
      const res = await autocomplete(v, abort.current.signal);
      setSuggestions(res);
      setActive(-1);
      if (res.length) setOpen(true);
    }, 220);
  }

  function handleInput(v: string) {
    onChange(v);
    if (skipFetch.current) {
      skipFetch.current = false;
      return;
    }
    setOpen(true);
    queryFor(v);
  }

  function choose(s: Suggestion) {
    skipFetch.current = true;
    onChange(s.label);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      if (active >= 0) {
        e.preventDefault();
        choose(suggestions[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="flex-1 relative">
      <label className="flex items-center gap-3 bg-white border border-field rounded-lg px-4 py-3 cursor-text focus-within:border-ink/50 transition">
        <Icon className="size-5 text-rust shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="block text-muted text-[12px] font-medium tracking-[0.03em] leading-4">
            {label}
          </span>
          <input
            value={value}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => suggestions.length && setOpen(true)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            className="w-full bg-transparent outline-none text-ink text-[18px] leading-7"
          />
        </div>
      </label>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-2 bg-white border border-line rounded-lg shadow-card overflow-hidden max-h-64 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep focus, fire before blur
                onClick={() => choose(s)}
                onMouseEnter={() => setActive(i)}
                className={[
                  "w-full text-left px-4 py-2.5 text-[14px] text-ink flex items-center gap-2 transition-colors",
                  i === active ? "bg-sand" : "hover:bg-sand/60",
                ].join(" ")}
              >
                <MapPin className="size-3.5 text-rust shrink-0" />
                <span className="truncate">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
