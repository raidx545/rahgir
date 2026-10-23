// Shared motion variants. Kept subtle and GPU-friendly (opacity + transform
// only) with short easeOut durations so transitions feel fast, not floaty.
import type { Variants, Transition } from "framer-motion";

export const ease: Transition["ease"] = [0.22, 1, 0.36, 1]; // easeOutQuint-ish

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease } },
};

// Parent that staggers its children into view.
export const stagger: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

// Child item used inside a `stagger` parent.
export const item: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease } },
};

// Small pop for cards/overlays.
export const pop: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease } },
};

export const tapScale = { scale: 0.97 };
export const hoverLift = { y: -1 };
