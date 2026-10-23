import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import type { LatLng, Stop } from "@/api/types";
import { useTheme } from "@/hooks/useTheme";

/**
 * The map canvas.
 *
 * Real tiles (CartoDB, no API key) are warmed with a CSS filter so the map sits
 * inside the Milestone palette instead of fighting it, and every stop is an
 * actual milestone stone rather than a generic pin.
 */

const TILES = {
  day: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  night: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};

/** A milestone stone, drawn as a Leaflet divIcon. */
function stoneIcon(km: number, tone: "band" | "route" | "marker", active: boolean) {
  const cap =
    tone === "route" ? "var(--color-primary)"
    : tone === "marker" ? "var(--color-marker)"
    : "var(--color-band)";
  const capFg = tone === "band" ? "var(--color-on-band)" : "var(--color-on-primary)";
  const w = active ? 44 : 34;
  const h = active ? 56 : 44;
  return L.divIcon({
    className: "",
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    html: `
      <div style="
        width:${w}px;height:${h}px;border-radius:${w / 2}px ${w / 2}px 3px 3px;
        background:var(--color-surface);
        border:2px solid ${active ? "var(--color-foreground)" : "var(--color-border-strong)"};
        box-shadow:0 ${active ? 6 : 2}px ${active ? 14 : 4}px var(--color-shadow);
        overflow:hidden;display:flex;flex-direction:column;
        transition:all 180ms cubic-bezier(.25,.46,.45,.94);">
        <div style="height:34%;background:${cap};color:${capFg};"></div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;
          font-family:Teko,sans-serif;font-weight:600;font-variant-numeric:tabular-nums;
          font-size:${active ? 17 : 13}px;color:var(--color-foreground);line-height:1;">
          ${km}
        </div>
      </div>`,
  });
}

function FitRoute({ points, selected }: { points: LatLng[]; selected?: Stop | null }) {
  const map = useMap();
  useEffect(() => {
    if (selected) {
      map.panTo([selected.coord.lat, selected.coord.lng], { animate: true });
      return;
    }
    if (points.length > 1) {
      map.fitBounds(
        L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
        { padding: [48, 48] },
      );
    }
  }, [points, selected, map]);
  return null;
}

export function TripMap({
  polyline,
  stops,
  selectedId,
  onSelect,
  className,
}: {
  polyline: LatLng[];
  stops: Stop[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const { theme } = useTheme();
  const line = useMemo(
    () => polyline.map((p) => [p.lat, p.lng] as [number, number]),
    [polyline],
  );
  const centre: [number, number] = line.length
    ? line[Math.floor(line.length / 2)]
    : [26.9, 75.8];
  const selected = stops.find((s) => s.id === selectedId) ?? null;

  return (
    <div
      className={className}
      style={{
        // Warm the tiles into the limestone palette.
        // @ts-expect-error custom property
        "--map-filter":
          theme === "night"
            ? "saturate(0.75) hue-rotate(-6deg) brightness(0.95)"
            : "sepia(0.22) saturate(0.78) hue-rotate(-8deg) brightness(1.02)",
      }}
    >
      <MapContainer
        center={centre}
        zoom={7}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
        style={{ background: "var(--color-surface-sunken)" }}
      >
        <TileLayer
          url={theme === "night" ? TILES.night : TILES.day}
          attribution='&copy; OpenStreetMap &copy; CARTO'
        />
        {line.length > 1 && (
          <>
            {/* casing, then the road */}
            <Polyline positions={line} pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.5 }} />
            <Polyline
              positions={line}
              pathOptions={{ color: "var(--color-route)", weight: 5, opacity: 0.95 }}
            />
          </>
        )}
        {stops.map((s) => (
          <Marker
            key={s.id}
            position={[s.coord.lat, s.coord.lng]}
            icon={stoneIcon(
              s.distanceFromStartKm,
              s.kind === "origin" ? "route" : s.kind === "destination" ? "marker" : "band",
              s.id === selectedId,
            )}
            zIndexOffset={s.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(s.id) }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              {s.name}
            </Tooltip>
          </Marker>
        ))}
        <FitRoute points={polyline} selected={selected} />
      </MapContainer>
    </div>
  );
}
