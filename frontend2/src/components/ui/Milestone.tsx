import { cn } from "@/lib/utils";

/**
 * MilestoneMarker — the concept made literal.
 * An NH kilometre stone: rounded cap, painted band carrying the place name in
 * stencil caps, limestone body carrying the distance numeral.
 *
 * Token rule enforced here: the band is a FILL (`--color-band`) and its text is
 * always `--color-on-band` (9.91:1). NH-yellow is never text on a light ground.
 */
export function MilestoneMarker({
  place,
  placeHi,
  km,
  unit = "km",
  size = "md",
  tone = "band",
  className,
}: {
  place: string;
  placeHi?: string;
  km: number | string;
  unit?: string;
  size?: "sm" | "md" | "lg";
  /** `band` = NH yellow cap, `route` = green cap (state highway), `marker` = red cap */
  tone?: "band" | "route" | "marker";
  className?: string;
}) {
  const dims = {
    sm: { w: 56, h: 72, place: "text-[9px]", km: "text-[20px]", hi: "text-[8px]" },
    md: { w: 76, h: 98, place: "text-[11px]", km: "text-[28px]", hi: "text-[9px]" },
    lg: { w: 104, h: 134, place: "text-[14px]", km: "text-[40px]", hi: "text-[11px]" },
  }[size];

  const capBg =
    tone === "route" ? "var(--color-primary)"
    : tone === "marker" ? "var(--color-marker)"
    : "var(--color-band)";
  const capFg =
    tone === "band" ? "var(--color-on-band)"
    : tone === "route" ? "var(--color-on-primary)"
    : "var(--color-on-marker)";

  return (
    <div
      className={cn("relative shrink-0 select-none overflow-hidden", className)}
      style={{
        width: dims.w,
        height: dims.h,
        borderRadius: "var(--milestone-radius)",
        background: "var(--color-surface)",
        border: "var(--milestone-border)",
        boxShadow: "0 2px 0 var(--color-shadow)",
      }}
      role="img"
      aria-label={`${place}, ${km} ${unit}`}
    >
      {/* painted cap — labels truncate cleanly; signage never overflows its board */}
      <div
        className="absolute inset-x-0 top-0 flex flex-col items-center justify-center gap-0 overflow-hidden px-1.5"
        style={{ height: "var(--milestone-band-h)", background: capBg, color: capFg }}
      >
        <span
          className={cn("sign-caps block w-full truncate text-center leading-none", dims.place)}
          aria-hidden
        >
          {place}
        </span>
        {placeHi && (
          <span
            className={cn("deva block w-full truncate text-center leading-none opacity-80", dims.hi)}
            aria-hidden
          >
            {placeHi}
          </span>
        )}
      </div>
      {/* stone body: the distance numeral */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center"
        style={{ top: "var(--milestone-band-h)" }}
        aria-hidden
      >
        <span
          className={cn("tabular font-display leading-none", dims.km)}
          style={{ color: "var(--color-foreground)", fontWeight: 600 }}
        >
          {km}
        </span>
        <span
          className="sign-caps leading-none"
          style={{ fontSize: 9, color: "var(--color-muted-foreground)" }}
        >
          {unit}
        </span>
      </div>
    </div>
  );
}

/** A thin painted band — the milestone motif reduced to a divider. */
export function BandRule({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className="h-[6px] flex-1 rounded-full"
        style={{ background: "var(--color-band)" }}
      />
      {label && (
        <span className="sign-caps text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
          {label}
        </span>
      )}
      <span
        className="h-[6px] flex-1 rounded-full"
        style={{ background: "var(--color-band)" }}
      />
    </div>
  );
}
