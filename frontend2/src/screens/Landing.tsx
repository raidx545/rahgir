import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeftRight, ArrowRight, Moon, Sun } from "lucide-react";
import { Button, Chip, Input } from "@/components/ui/primitives";
import { MilestoneMarker } from "@/components/ui/Milestone";
import { RouteLine } from "@/components/RouteLine";
import { AGENTS } from "@/api/fixtures";
import { useTheme, usePrefersReducedMotion } from "@/hooks/useTheme";

/** Demo routes — each maps to a fixture in the mock API. */
const ROUTES = [
  { from: "Delhi", to: "Jaipur", details: "2 din, budget 6000, achha khana chahiye" },
  { from: "Mumbai", to: "Goa", details: "2 days, coastal food, no night driving" },
  { from: "Manali", to: "Leh", details: "3 days, acclimatise properly, SUV" },
];

/** Rotating ghost text for the optional preferences line. */
const EXAMPLES = ROUTES.map((r) => r.details);

/** Places the demo knows about — powers the native suggestion list. */
const PLACES = [
  "Delhi", "Jaipur", "Mumbai", "Goa", "Manali", "Leh",
  "Agra", "Udaipur", "Pune", "Chandigarh", "Amritsar", "Jodhpur",
];

const DEMO_STONES = [
  { place: "Delhi", placeHi: "दिल्ली", km: 0, tone: "route" as const },
  { place: "Sultanpur", placeHi: "सुल्तानपुर", km: 48, tone: "band" as const },
  { place: "Neemrana", placeHi: "नीमराणा", km: 122, tone: "band" as const },
  { place: "Shahpura", placeHi: "शाहपुरा", km: 198, tone: "band" as const },
  { place: "Jaipur", placeHi: "जयपुर", km: 281, tone: "marker" as const },
];

/* A decorative strip, not a projection: the stones are laid out evenly, so the
   road behind them is an evenly-spaced gentle wave rather than real geography. */
const DEMO_LINE = [
  { lat: 0.5, lng: 0 }, { lat: 0.62, lng: 1 }, { lat: 0.44, lng: 2 },
  { lat: 0.6, lng: 3 }, { lat: 0.48, lng: 4 },
];

/** Typewriter that cycles real trip intents — the demo *is* the pitch. */
function useTypewriter(enabled: boolean) {
  const [text, setText] = useState("");
  const [idx, setIdx] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setText(EXAMPLES[0]);
      return;
    }
    let char = 0;
    let deleting = false;
    const phrase = EXAMPLES[idx];

    const tick = () => {
      if (!deleting) {
        char++;
        setText(phrase.slice(0, char));
        if (char >= phrase.length) {
          deleting = true;
          timer.current = setTimeout(tick, 2400);
          return;
        }
      } else {
        char -= 3;
        if (char <= 0) {
          setIdx((i) => (i + 1) % EXAMPLES.length);
          return;
        }
        setText(phrase.slice(0, char));
      }
      timer.current = setTimeout(tick, deleting ? 18 : 45);
    };
    timer.current = setTimeout(tick, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [idx, enabled]);

  return text;
}

/**
 * One end of the road. The coloured dot matches the milestone cap tone used for
 * that stop on the map — green for origin, red for destination.
 */
function FieldStack({
  id, label, labelHi, dotColor, value, onChange, onEnter, placeholder,
}: {
  id: string;
  label: string;
  labelHi: string;
  dotColor: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="flex items-center gap-1.5">
        <span className="size-2 shrink-0 rounded-full" style={{ background: dotColor }} aria-hidden />
        <span className="sign-caps text-[10px]" style={{ color: "var(--color-muted-foreground)" }}>
          {label}
        </span>
        <span className="deva text-[11px]" style={{ color: "var(--color-muted-foreground)", opacity: 0.8 }}>
          {labelHi}
        </span>
      </label>
      <Input
        id={id}
        list="places"
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        placeholder={placeholder}
        className="mt-1 text-[1.15rem]"
        style={{ minHeight: 52, fontWeight: 500 }}
      />
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const reduced = usePrefersReducedMotion();
  // Pre-filled so the demo is a single click, but fully editable.
  const [from, setFrom] = useState("Delhi");
  const [to, setTo] = useState("Jaipur");
  const [details, setDetails] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const ghost = useTypewriter(!reduced && !focused && details.length === 0);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const go = (r?: { from: string; to: string; details: string }) => {
    const f = (r?.from ?? from).trim();
    const t = (r?.to ?? to).trim();
    if (!f || !t) {
      setError("Both a starting point and a destination are needed.");
      return;
    }
    if (f.toLowerCase() === t.toLowerCase()) {
      setError("Start and destination are the same place.");
      return;
    }
    setError("");
    const d = (r?.details ?? details).trim();
    // The API takes one natural-language intent; compose it from the fields so
    // the demo stays explicit without changing the contract.
    const intent = `${f} to ${t}${d ? `, ${d}` : ""}`;
    navigate(`/planning?intent=${encodeURIComponent(intent)}`);
  };

  return (
    <div className="min-h-dvh flex flex-col">
      {/* ── Top bar: the wordmark is Devanagari-first ───────────────────── */}
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-baseline gap-2.5">
          <span
            className="deva text-[24px] leading-none"
            style={{ color: "var(--color-foreground)", fontWeight: 700 }}
          >
            राहगीर
          </span>
          <span
            className="sign-caps text-[11px]"
            style={{ color: "var(--color-muted-foreground)" }}
          >
            Rahgir
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={theme === "day" ? "Switch to night drive theme" : "Switch to day theme"}
        >
          {theme === "day" ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
        </Button>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-5 sm:px-8">
        <div className="mx-auto w-full max-w-[1080px] pt-6 sm:pt-14">
          {/* signage kicker */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.215, 0.61, 0.355, 1] }}
            className="flex items-center gap-3"
          >
            <span
              className="sign-caps rounded-[3px] px-2 py-1 text-[11px]"
              style={{ background: "var(--color-band)", color: "var(--color-on-band)" }}
            >
              NH 48
            </span>
            <span
              className="sign-caps text-[11px]"
              style={{ color: "var(--color-muted-foreground)" }}
            >
              दिल्ली → जयपुर · 281 km
            </span>
          </motion.div>

          {/* the name as typographic asset */}
          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.06, ease: [0.215, 0.61, 0.355, 1] }}
            className="mt-4"
          >
            <span
              className="deva block"
              style={{
                fontSize: "clamp(3.5rem, 13vw, 9rem)",
                lineHeight: 0.92,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: "var(--color-foreground)",
              }}
            >
              राहगीर
            </span>
            <span
              className="sign-caps mt-1 block"
              style={{
                fontSize: "clamp(1rem, 3.2vw, 1.9rem)",
                color: "var(--color-primary)",
                letterSpacing: "0.34em",
              }}
            >
              Rahgir
            </span>
          </motion.h1>

          <motion.p
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="edito mt-5 max-w-[46ch] text-[clamp(1.05rem,2.2vw,1.45rem)] italic"
            style={{ color: "var(--color-muted-foreground)", lineHeight: 1.45 }}
          >
            “One who is on the road.” Tell Rahgir where you're going — in whatever
            words come naturally — and it plans the whole drive, stop by stop.
          </motion.p>

          {/* ── The centre of gravity: trip intent ─────────────────────── */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.26, ease: [0.215, 0.61, 0.355, 1] }}
            className="mt-9"
          >
            <span className="sign-caps text-[11px]"
              style={{ color: "var(--color-muted-foreground)" }}>
              Where are you headed?
            </span>

            {/* The signboard: FROM → TO, the two ends of the road. */}
            <div
              className="mt-2 p-3"
              style={{
                background: "var(--color-surface)",
                border: "2px solid var(--color-border-strong)",
                borderRadius: "var(--p-radius-lg)",
              }}
            >
              <datalist id="places">
                {PLACES.map((p) => <option key={p} value={p} />)}
              </datalist>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <FieldStack
                  id="from"
                  label="From"
                  labelHi="से"
                  dotColor="var(--color-primary)"
                  value={from}
                  onChange={setFrom}
                  onEnter={() => go()}
                  placeholder="Delhi"
                />

                {/* Swap — a real affordance on any travel form. */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={swap}
                  aria-label="Swap starting point and destination"
                  className="self-center sm:mb-[2px] sm:self-end"
                  title="Swap"
                >
                  <ArrowLeftRight className="size-4 sm:rotate-0 rotate-90" />
                </Button>

                <FieldStack
                  id="to"
                  label="To"
                  labelHi="तक"
                  dotColor="var(--color-marker)"
                  value={to}
                  onChange={setTo}
                  onEnter={() => go()}
                  placeholder="Jaipur"
                />
              </div>

              {/* The natural-language part is still here — just subordinate. */}
              <div className="relative mt-3">
                <label htmlFor="details" className="sign-caps text-[10px]"
                  style={{ color: "var(--color-muted-foreground)" }}>
                  Preferences · optional
                </label>
                <div className="relative mt-1">
                  <Input
                    id="details"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(e) => e.key === "Enter" && go()}
                    aria-describedby="intent-help"
                  />
                  {details.length === 0 && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[0.95rem]"
                      style={{ color: "var(--color-muted-foreground)", opacity: 0.7 }}
                    >
                      {ghost}
                      {!reduced && !focused && (
                        <span
                          className="ml-[1px] inline-block w-[2px] self-center"
                          style={{ height: "1.1em", background: "var(--color-primary)" }}
                        />
                      )}
                    </span>
                  )}
                </div>
              </div>

              <Button onClick={() => go()} className="mt-3 w-full" style={{ minHeight: 52 }}>
                <span className="sign-caps text-[13px]">चलो · Plan the drive</span>
                <ArrowRight className="size-4" />
              </Button>
            </div>

            {error && (
              <p role="alert" className="mt-2 text-[0.8125rem] font-medium"
                style={{ color: "var(--color-destructive)" }}>
                {error}
              </p>
            )}

            <p id="intent-help" className="mt-2 text-[0.8125rem]"
              style={{ color: "var(--color-muted-foreground)" }}>
              Hindi, English or both — “2 din”, “budget 6000”, “achha khana” all work.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="sign-caps text-[10px]" style={{ color: "var(--color-muted-foreground)" }}>
                Try
              </span>
              {ROUTES.map((r) => (
                <button
                  key={r.from}
                  onClick={() => { setFrom(r.from); setTo(r.to); setDetails(r.details); go(r); }}
                  className="cursor-pointer rounded-full px-3 py-2 text-left text-[0.75rem] transition-colors"
                  style={{
                    minHeight: 36,
                    background: "var(--color-surface-sunken)",
                    color: "var(--color-muted-foreground)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {r.from} → {r.to}
                </button>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── Live-feeling demo: a route drawing through milestone stones ── */}
        <section className="mx-auto mt-14 w-full max-w-[1080px] pb-16" aria-label="Example route preview">
          <div className="flex items-baseline justify-between">
            <span className="sign-caps text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
              A plan looks like this
            </span>
            <span className="sign-caps text-[11px] tabular" style={{ color: "var(--color-muted-foreground)" }}>
              5 stops · 2 din
            </span>
          </div>

          {/* The road runs behind the stones, exactly as it does on the highway. */}
          <div className="relative mt-4 h-[128px] overflow-x-auto">
            <RouteLine
              points={DEMO_LINE}
              width={1000}
              height={128}
              className="pointer-events-none absolute inset-0 h-full w-full min-w-[560px]"
            />
            <ul className="relative flex h-full min-w-[560px] items-center justify-between gap-2">
              {DEMO_STONES.map((s, i) => (
                <motion.li
                  key={s.place}
                  initial={reduced ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,                    // preset 7: 250–350ms
                    delay: 0.5 + i * 0.06,            // stagger-step 60ms
                    ease: [0.25, 0.46, 0.45, 0.94],   // power1.out
                  }}
                >
                  <MilestoneMarker
                    place={s.place}
                    placeHi={s.placeHi}
                    km={s.km}
                    tone={s.tone}
                    size="md"
                  />
                </motion.li>
              ))}
            </ul>
          </div>

          {/* provenance, not a feature grid */}
          <div className="mt-10 flex flex-wrap items-center gap-2">
            <span className="sign-caps mr-1 text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
              Planned by
            </span>
            {AGENTS.map((a) => (
              <Chip key={a.id} tone="neutral">
                <span className="deva">{a.labelHi}</span>
                <span className="opacity-55">{a.label}</span>
              </Chip>
            ))}
            <span className="ml-1 text-[0.75rem]" style={{ color: "var(--color-muted-foreground)" }}>
              — five agents, working the route together.
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
