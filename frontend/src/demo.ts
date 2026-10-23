// Demo trip fixture — lets the Dashboard render without a live backend.
// Loaded when visiting /dashboard?demo=1 with no real trip in the store.
import type { TripResponse } from "./api";

// A coarse Delhi → Jaipur polyline (lat, lon) for the map preview.
const LINE: [number, number][] = [
  [28.6139, 77.209],
  [28.42, 76.98],
  [28.19, 76.61],
  [27.89, 76.36],
  [27.55, 76.12],
  [27.21, 75.98],
  [26.9124, 75.7873],
];

export const demoTrip: TripResponse = {
  trip_id: "demo",
  request: {
    start: "Delhi",
    destination: "Jaipur",
    departure: "2024-05-15T08:00:00Z",
    detour_budget_min: 120,
    themes: ["heritage"],
  },
  start_point: { lat: 28.6139, lon: 77.209 },
  end_point: { lat: 26.9124, lon: 75.7873 },
  total_distance_km: 281,
  total_duration_min: 300,
  waypoint_count: 12,
  raw_place_count: 34,
  polyline: LINE.map(([lat, lon]) => ({ lat, lon })),
  itinerary: {
    intro:
      "A classic run down NH48 — but the Pink City can wait an hour while you eat like a local and stand where kings once did.",
    stops: [
      {
        xid: "demo1",
        name: "Neemrana Fort Palace",
        kinds: "historic,fortifications,architecture",
        point: { lat: 27.9889, lon: 76.3869 },
        rate: 3,
        dist_to_route_km: 2.1,
        nearest_waypoint_km: 110,
        wikidata: null,
        photo_ref: null,
        photo_url:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Neemrana_Fort_Palace_terrace_and_the_town_below.jpg/330px-Neemrana_Fort_Palace_terrace_and_the_town_below.jpg",
        score: 0.82,
        eta: "2024-05-15T10:30:00Z",
        why: "A 15th-century hillside fort turned heritage hotel. Stop for a majestic view and a traditional Rajasthani thali in the courtyard — budget about 90 minutes.",
      },
      {
        xid: "demo2",
        name: "Shahpura (Highway)",
        kinds: "foods,marketplaces",
        point: { lat: 27.39, lon: 76.02 },
        rate: 2,
        dist_to_route_km: 0.4,
        nearest_waypoint_km: 175,
        wikidata: null,
        photo_ref: null,
        photo_url:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Rajasthani_Raj_Kachori.jpg/330px-Rajasthani_Raj_Kachori.jpg",
        score: 0.71,
        eta: "2024-05-15T13:15:00Z",
        why: "Rawat's Pyaaz Kachori — crispy, spicy onion-filled pastry. A legendary highway snack you cannot miss. Ten minutes, no regrets.",
      },
      {
        xid: "demo3",
        name: "Amber Fort Approach",
        kinds: "historic,monuments",
        point: { lat: 26.985, lon: 75.851 },
        rate: 3,
        dist_to_route_km: 6.2,
        nearest_waypoint_km: 265,
        wikidata: null,
        photo_ref: null,
        photo_url:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/20191219_Fort_Amber%2C_Amer%2C_Jaipur_0955_9481.jpg/330px-20191219_Fort_Amber%2C_Amer%2C_Jaipur_0955_9481.jpg",
        score: 0.68,
        eta: "2024-05-15T15:45:00Z",
        why: "If light permits, catch the amber sandstone glowing at golden hour before you roll into the city.",
      },
    ],
    narrative_markdown: "",
  },
  warnings: [],
};
