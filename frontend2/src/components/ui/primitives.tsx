import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ── Button ─────────────────────────────────────────────────────────────── */
/* Every variant inherits --control-min (44px) per the Touch UX rule. */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-body font-medium " +
    "transition-[background-color,color,box-shadow,transform] cursor-pointer select-none " +
    "disabled:pointer-events-none disabled:opacity-45 active:translate-y-[1px]",
  {
    variants: {
      variant: {
        primary: "text-[var(--color-on-primary)] bg-[var(--color-primary)] hover:brightness-110",
        band: "text-[var(--color-on-band)] bg-[var(--color-band)] hover:brightness-105",
        outline:
          "bg-transparent text-[var(--color-foreground)] border-2 border-[var(--color-border-strong)] hover:bg-[var(--color-surface-sunken)]",
        ghost: "bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-surface-sunken)]",
        danger: "text-[var(--color-on-destructive)] bg-[var(--color-destructive)] hover:brightness-110",
      },
      size: {
        md: "text-[0.9375rem] px-5 rounded-[var(--btn-radius)]",
        sm: "text-[0.8125rem] px-3 rounded-[var(--btn-radius)]",
        icon: "rounded-[var(--btn-radius)] px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size = "md", asChild, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const minH = size === "sm" ? "var(--btn-height-sm)" : "var(--control-min)";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        style={{
          minHeight: minH,
          minWidth: size === "icon" ? minH : undefined,
          transitionDuration: "var(--dur-hover)",
          transitionTimingFunction: "var(--p-ease-power1-out)",
          ...style,
        }}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

/* ── Card ───────────────────────────────────────────────────────────────── */

export function Card({
  className, raised, style, ...props
}: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div
      className={cn("relative", className)}
      style={{
        background: "var(--card-bg)",
        border: "var(--card-border)",
        borderRadius: "var(--card-radius)",
        boxShadow: raised ? "var(--card-shadow-raised)" : "var(--card-shadow)",
        ...style,
      }}
      {...props}
    />
  );
}

/* ── Chip / Badge ───────────────────────────────────────────────────────── */

export function Chip({
  children, tone = "neutral", className, ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "band" | "route" | "marker";
}) {
  const map = {
    neutral: { bg: "var(--color-surface-sunken)", fg: "var(--color-muted-foreground)", bd: "var(--color-border)" },
    band:    { bg: "var(--color-band)",   fg: "var(--color-on-band)",   bd: "transparent" },
    route:   { bg: "color-mix(in oklch, var(--color-primary) 14%, transparent)", fg: "var(--color-primary)", bd: "color-mix(in oklch, var(--color-primary) 35%, transparent)" },
    marker:  { bg: "color-mix(in oklch, var(--color-marker) 14%, transparent)",  fg: "var(--color-marker)",  bd: "color-mix(in oklch, var(--color-marker) 35%, transparent)" },
  }[tone];
  return (
    <span
      className={cn(
        // never let a chip wrap mid-label (UX: badge/chip label wraps)
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.6875rem] font-medium",
        className,
      )}
      style={{ background: map.bg, color: map.fg, border: `1px solid ${map.bd}` }}
      {...props}
    >
      {children}
    </span>
  );
}

/* ── Input ──────────────────────────────────────────────────────────────── */

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, style, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "w-full bg-transparent px-4 font-body outline-none placeholder:opacity-55",
      className,
    )}
    style={{
      minHeight: "var(--input-height)",
      background: "var(--input-bg)",
      border: "var(--input-border)",
      borderRadius: "var(--input-radius)",
      color: "var(--color-foreground)",
      ...style,
    }}
    {...props}
  />
));
Input.displayName = "Input";

/* ── Skeleton (GSAP preset 15: 1200–1600ms sine.inOut, pauses offscreen) ── */

export function Skeleton({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("rah-skeleton rounded-[var(--p-radius-md)]", className)}
      style={{ background: "var(--color-surface-sunken)", ...style }}
      {...props}
    />
  );
}

/* ── Screen-reader announcer ────────────────────────────────────────────────
   UX rule "Contextual Live Badge Updates": ONE atomic status region with a
   meaningful sentence — not a bare number, and not many competing regions. */

export function LiveStatus({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
