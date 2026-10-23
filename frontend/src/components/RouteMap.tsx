import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import type { TripResponse, RankedPlace } from "../api";

function divIcon(html: string, size: [number, number]) {
  return L.divIcon({
    html,
    className: "",
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1] / 2],
  });
}

const startIcon = divIcon(
  `<div style="width:16px;height:16px;border-radius:9999px;background:#061b0e;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
  [16, 16],
);
const endIcon = divIcon(
  `<div style="width:18px;height:18px;border-radius:9999px;background:#a04100;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
  [18, 18],
);
const stopIcon = divIcon(
  `<div style="width:14px;height:14px;border-radius:9999px;background:#fff;border:3px solid #a04100;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer"></div>`,
  [14, 14],
);
const selectedStopIcon = divIcon(
  `<div style="width:24px;height:24px;border-radius:9999px;background:#a04100;border:4px solid #fff;box-shadow:0 2px 10px rgba(160,65,0,.6);cursor:pointer"></div>`,
  [24, 24],
);

function FitBounds({ trip }: { trip: TripResponse }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = trip.polyline.length
      ? trip.polyline.map((p) => [p.lat, p.lon])
      : [
          [trip.start_point.lat, trip.start_point.lon],
          [trip.end_point.lat, trip.end_point.lon],
        ];
    if (pts.length) {
      map.fitBounds(L.latLngBounds(pts), { padding: [60, 60] });
    }
  }, [trip, map]);
  return null;
}

const TILES = {
  standard: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenTopoMap (CC-BY-SA), &copy; OpenStreetMap contributors",
  },
} as const;

export default function RouteMap({
  trip,
  stops,
  tile = "standard",
  onMap,
  selectedId,
  onSelectStop,
}: {
  trip: TripResponse;
  stops?: RankedPlace[];
  tile?: "standard" | "terrain";
  onMap?: (map: L.Map) => void;
  selectedId?: string | null;
  onSelectStop?: (xid: string) => void;
}) {
  const line: [number, number][] = trip.polyline.map((p) => [p.lat, p.lon]);
  const markers = stops ?? trip.itinerary.stops;
  const center: [number, number] = [
    (trip.start_point.lat + trip.end_point.lat) / 2,
    (trip.start_point.lon + trip.end_point.lon) / 2,
  ];
  const tiles = TILES[tile];

  return (
    <MapContainer
      center={center}
      zoom={7}
      className="h-full w-full"
      scrollWheelZoom
      zoomControl={false}
      ref={(m) => {
        if (m && onMap) onMap(m);
      }}
    >
      <TileLayer attribution={tiles.attribution} url={tiles.url} />
      {line.length > 1 && (
        <>
          <Polyline positions={line} pathOptions={{ color: "#a04100", weight: 5, opacity: 0.85 }} />
          <Polyline positions={line} pathOptions={{ color: "#fff", weight: 9, opacity: 0.35 }} />
          <Polyline positions={line} pathOptions={{ color: "#a04100", weight: 5, opacity: 0.9 }} />
        </>
      )}
      <Marker position={[trip.start_point.lat, trip.start_point.lon]} icon={startIcon} />
      <Marker position={[trip.end_point.lat, trip.end_point.lon]} icon={endIcon} />
      {markers.map((s) => (
        <Marker
          key={s.xid}
          position={[s.point.lat, s.point.lon]}
          icon={s.xid === selectedId ? selectedStopIcon : stopIcon}
          zIndexOffset={s.xid === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelectStop?.(s.xid) }}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            {s.name}
          </Tooltip>
        </Marker>
      ))}
      <FitBounds trip={trip} />
    </MapContainer>
  );
}
