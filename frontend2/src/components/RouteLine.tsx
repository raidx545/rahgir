import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import type { LatLng } from "@/api/types";
import { usePrefersReducedMotion } from "@/hooks/useTheme";

/**
 * The route drawing itself onto the page.
 *
 * GSAP earns its place here: a stroke-dashoffset draw synchronised with marker
 * reveals is a timeline problem, not a component-state problem. Under
 * prefers-reduced-motion the path renders in its final drawn state instantly.
 */
export function RouteLine({
  points,
  width = 1000,
  height = 220,
  className,
  play = true,
  strokeVar = "var(--color-route)",
}: {
  points: LatLng[];
  width?: number;
  height?: number;
  className?: string;
  play?: boolean;
  strokeVar?: string;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const reduced = usePrefersReducedMotion();

  const d = useMemo(() => {
    if (points.length < 2) return "";
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const padX = 40, padY = 30;
    const sx = (lng: number) =>
      padX + ((lng - minLng) / (maxLng - minLng || 1)) * (width - padX * 2);
    const sy = (lat: number) =>
      height - padY - ((lat - minLat) / (maxLat - minLat || 1)) * (height - padY * 2);

    // Smooth the corridor with quadratic midpoints — roads bend, they don't kink.
    let out = `M ${sx(points[0].lng)} ${sy(points[0].lat)}`;
    for (let i = 1; i < points.length - 1; i++) {
      const x = sx(points[i].lng), y = sy(points[i].lat);
      const nx = sx(points[i + 1].lng), ny = sy(points[i + 1].lat);
      out += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
    }
    const last = points[points.length - 1];
    out += ` T ${sx(last.lng)} ${sy(last.lat)}`;
    return out;
  }, [points, width, height]);

  useEffect(() => {
    const el = pathRef.current;
    if (!el || !d) return;
    const len = el.getTotalLength();
    gsap.set(el, { strokeDasharray: len, strokeDashoffset: reduced || !play ? 0 : len });
    if (reduced || !play) return;
    const tw = gsap.to(el, {
      strokeDashoffset: 0,
      duration: 1.6, // --dur-route-draw
      ease: "power2.out",
    });
    return () => {
      tw.kill();
    };
  }, [d, play, reduced]);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
      preserveAspectRatio="none"
    >
      {/* ghost of the road under the drawn line */}
      <path
        d={d}
        stroke="var(--color-border)"
        strokeWidth="var(--route-stroke)"
        strokeLinecap="round"
        opacity={0.7}
      />
      <path
        ref={pathRef}
        d={d}
        stroke={strokeVar}
        strokeWidth="var(--route-stroke)"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
