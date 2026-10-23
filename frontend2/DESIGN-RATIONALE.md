# Rahgir · राहगीर — Design Rationale

**Art direction: "मील का पत्थर / Milestone"** — the NH kilometre stone.

## Why this concept

A milestone is not decoration; it is the only piece of Indian roadside design
whose *entire job* is to answer "where am I, and how far is it still?" That is
also the job of an itinerary. So the motif does structural work:

| Road object | UI role |
|---|---|
| Kilometre stone | Every stop marker — carries place name + distance-from-origin |
| Painted top band | Category colour (highway green = route, yellow = a stop, red = destination) |
| Stencilled signage caps | All labels, kickers, and data headers |
| Topographic contour lines | Page ground texture |
| The road itself | The drawn route line running *behind* the stones |

We committed to this one motif and did not sample truck art, dhaba enamel, or
ticket stubs alongside it.

## Sourced from the `ui-ux-pro-max` database

| Decision | Source | Note |
|---|---|---|
| Style: **Editorial Grid / Magazine** | `styles.csv` | `perf cost:low`, `a11y risk:low`. **Rejected** the auto-recommended *Aurora UI* — mesh gradients marked *"Best For: Modern SaaS"*. |
| Palette structure | `products.csv` → exact match **Road Trip Planner** | "Adventure warm sunset orange + map teal + stop markers + road neutral". Kept the four *roles*, replaced the generic hexes with road-specific hues. |
| Motion durations/easings | `motion.csv` presets 1, 5, 7, 10, 15 | Transcribed into `--dur-*` and `--p-ease-*` tokens. |
| Token architecture | `stacks/shadcn.csv` | OKLCH semantic vars + `@theme inline`; complete `:root` **and** `.dark`. |
| UX rules | `ux-guidelines.csv` | Streaming, AI disclosure, live regions, drag alternatives, gesture conflicts. |

**Documented gap:** `typography.csv` contains **no Devanagari pairing** (it
returned Wedding Script / Handwritten / Vietnamese, and the design-system pass
suggested *Noto Serif TC* — Traditional Chinese, wrong script). We therefore
built the pairing from `google-fonts.csv`, which lists **61 Devanagari-capable
families**. Every font below is verified from that data, not assumed.

## Typography — bilingual by construction

| Role | Family | Why |
|---|---|---|
| Display / signage | **Teko** (var. 300–700) | Condensed grotesque that reads like painted highway signage; native Devanagari. |
| Body / UI | **Anek Devanagari** (var. `wdth` 75–125, `wght` 100–800) | Purpose-built for Devanagari + Latin; the width axis lets labels fit a stone cap without a second family. |
| Editorial | **Eczar** (var. 400–800) | Literary serif with real Devanagari design, for pull-quotes and the voice of the guide. |

`राहगीर` is set larger than `RAHGIR` and appears first. Devanagari is the
primary asset; the Latin is the transliteration, not the other way round.

## Colour — and one hard rule

All values are OKLCH. Contrast was computed, not eyeballed:

| Pair | Ratio | Verdict |
|---|---|---|
| tar-black on limestone | 16.77:1 | ✅ AA |
| highway-green on limestone | 6.20:1 | ✅ AA |
| km-red on limestone | 5.18:1 | ✅ AA |
| **NH-yellow on limestone** | **1.69:1** | ❌ **FAIL** |
| tar-black on NH-yellow | 9.91:1 | ✅ AA |

> **The milestone band rule.** NH-yellow is never text on a background. It is
> only ever a *fill* carrying tar-black text — exactly how a real stone is
> painted. This is encoded as the `--color-band` / `--color-on-band` pair, so a
> component physically cannot use yellow as a foreground colour.

### Night drive ≠ inverted day

The dark theme is modelled on an instrument cluster and headlights hitting a
retroreflective sign, not on a colour inversion. The ground drops to tar
(`#0E0C0B`), and the band and route line *brighten*. Every night value was
re-verified: green 6.47:1, red 5.85:1 (day red would have failed at 3.24:1, so
it is swapped for a lighter tint), yellow 11.54:1, and the band rule still holds
at 11.19:1.

## Three token layers

```
PRIMITIVE   --p-limestone-100, --p-nh-yellow-500 …   ← only layer with raw colour
   ↓
SEMANTIC    --color-background, --color-route,       ← meaning, theme-swapped
            --color-band / --color-on-band …
   ↓
COMPONENT   --btn-height, --milestone-band-h,        ← per-component knobs
            --timeline-rail-w, --route-stroke …
```

Components consume **only** semantic and component tokens. No raw hex appears
outside `design-tokens.css`.

## Accessibility commitments

- Every interactive control inherits `--control-min: 44px`.
- `:focus-visible` ring is global and never removed.
- `prefers-reduced-motion` is honoured twice: a global CSS floor, and a JS hook
  (`usePrefersReducedMotion`) so GSAP/framer timelines render their final state
  instead of animating.
- Streaming agent output uses **one** atomic `role="status"` region with a
  meaningful sentence — not a bare number, and not competing live regions.
- Stop reordering will ship keyboard Move-up/down controls beside any drag
  handle (WCAG 2.2 *Dragging Movements*).
