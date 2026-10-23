import type { AgentId, AgentMeta, LatLng, Stop, Trip } from "./types";

/** Mirrors the real LangGraph nodes: route → sample → places → rank → narrator. */
export const AGENTS: AgentMeta[] = [
  { id: "route",    label: "Route",    labelHi: "मार्ग",  verb: "Tracing the highway" },
  { id: "sample",   label: "Waypoints", labelHi: "पड़ाव",  verb: "Marking milestones along the way" },
  { id: "places",   label: "Discover", labelHi: "दर्शन",  verb: "Looking for what's worth stopping for" },
  { id: "rank",     label: "Choose",   labelHi: "चुनाव",  verb: "Scoring detours against your budget" },
  { id: "narrator", label: "Narrate",  labelHi: "कहानी",  verb: "Writing it up like a local friend" },
];

export const agentMeta = (id: AgentId) => AGENTS.find((a) => a.id === id)!;

const photo = (seed: string, w = 800, h = 600) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

/* ── Route geometries (approximate, real corridors) ─────────────────────── */

const NH48_DELHI_JAIPUR: LatLng[] = [
  { lat: 28.6139, lng: 77.209 }, { lat: 28.4595, lng: 77.0266 },
  { lat: 28.3213, lng: 76.8991 }, { lat: 28.1861, lng: 76.7965 },
  { lat: 28.0229, lng: 76.6066 }, { lat: 27.8974, lng: 76.4321 },
  { lat: 27.7461, lng: 76.2734 }, { lat: 27.5891, lng: 76.1245 },
  { lat: 27.3925, lng: 75.9987 }, { lat: 27.2103, lng: 75.9012 },
  { lat: 27.0421, lng: 75.8412 }, { lat: 26.9124, lng: 75.7873 },
];

const NH66_MUMBAI_GOA: LatLng[] = [
  { lat: 19.076, lng: 72.8777 }, { lat: 18.9894, lng: 73.1175 },
  { lat: 18.6414, lng: 73.1322 }, { lat: 18.1021, lng: 73.4102 },
  { lat: 17.7514, lng: 73.4008 }, { lat: 17.5301, lng: 73.3221 },
  { lat: 17.0005, lng: 73.2891 }, { lat: 16.7112, lng: 73.4102 },
  { lat: 16.2109, lng: 73.6801 }, { lat: 15.8994, lng: 73.8123 },
  { lat: 15.5501, lng: 73.9812 }, { lat: 15.2993, lng: 74.124 },
];

const MANALI_LEH: LatLng[] = [
  { lat: 32.2432, lng: 77.1892 }, { lat: 32.3721, lng: 77.2461 },
  { lat: 32.5502, lng: 77.2013 }, { lat: 32.7412, lng: 77.0301 },
  { lat: 32.9101, lng: 77.1102 }, { lat: 33.0512, lng: 77.2612 },
  { lat: 33.2201, lng: 77.4101 }, { lat: 33.4501, lng: 77.5312 },
  { lat: 33.6702, lng: 77.6021 }, { lat: 33.8912, lng: 77.5801 },
  { lat: 34.0402, lng: 77.5912 }, { lat: 34.1526, lng: 77.5771 },
];

const stop = (s: Omit<Stop, "alternatives" | "photos"> & Partial<Pick<Stop, "alternatives" | "photos">>): Stop => ({
  alternatives: [],
  photos: [photo(s.id), photo(`${s.id}-b`), photo(`${s.id}-c`)],
  ...s,
});

/* ── 1 · Delhi → Jaipur (the hero fixture, matches the sample intent) ───── */

const delhiJaipur: Trip = {
  id: "del-jai",
  from: "Delhi", fromHi: "दिल्ली",
  to: "Jaipur",  toHi: "जयपुर",
  intent: "Delhi se Jaipur, 2 din, budget 6000, achha khana chahiye",
  totalKm: 281, totalDriveMin: 320,
  fuelLitres: 23.4, fuelCostInr: 2270, tollsInr: 585, foodInr: 1150, stayInr: 1800,
  budgetInr: 6000,
  polyline: NH48_DELHI_JAIPUR,
  days: [
    {
      index: 1, label: "Day 1 · Delhi to Neemrana", labelHi: "पहला दिन",
      startTime: "06:30", endTime: "14:10", distanceKm: 122, driveMin: 145,
      stops: [
        stop({
          id: "s-origin", kind: "origin", name: "Delhi", nameHi: "दिल्ली",
          subtitle: "Depart before the Gurgaon crawl",
          coord: { lat: 28.6139, lng: 77.209 },
          distanceFromStartKm: 0, detourMin: 0, dwellMin: 0, costInr: 0,
          why: "Leaving by 06:30 puts you past Gurgaon before the office rush builds on NH48.",
          timingAdvice: "After 08:00 this stretch adds 40–55 min.",
          agent: "route",
        }),
        stop({
          id: "s-murthal", kind: "food", name: "Sultanpur Dhaba Cluster", nameHi: "सुल्तानपुर ढाबा",
          subtitle: "Paratha, white butter, kadak chai",
          coord: { lat: 28.3213, lng: 76.8991 },
          distanceFromStartKm: 48, detourMin: 6, dwellMin: 40, costInr: 260,
          why: "Highest-rated early-morning paratha stop within 6 min of the highway; opens at 05:00 so it fits a dawn departure.",
          timingAdvice: "Best 07:00–09:00. Tandoor cools by mid-morning.",
          rating: 4.4, agent: "places",
          alternatives: [
            { id: "alt-1", name: "Rao Highway Dhaba", detourMin: 3, costInr: 220, note: "Faster, thinner crowd, plainer food" },
            { id: "alt-2", name: "Amrik Sukhdev (Murthal side)", detourMin: 22, costInr: 340, note: "Famous, but a real detour from NH48" },
          ],
        }),
        stop({
          id: "s-fuel-1", kind: "fuel", name: "Dharuhera Fuel Stop", nameHi: "धारूहेड़ा",
          subtitle: "Last cheap diesel before the Rajasthan border",
          coord: { lat: 28.1861, lng: 76.7965 },
          distanceFromStartKm: 71, detourMin: 2, dwellMin: 12, costInr: 1400,
          why: "Fuel is ₹2.4/L cheaper in Haryana than across the Rajasthan border — worth topping up here.",
          agent: "rank",
        }),
        stop({
          id: "s-neemrana", kind: "sight", name: "Neemrana Fort Palace", nameHi: "नीमराणा किला",
          subtitle: "15th-century fort cut into the hillside",
          coord: { lat: 27.8974, lng: 76.4321 },
          distanceFromStartKm: 122, detourMin: 14, dwellMin: 110, costInr: 600,
          why: "The only major heritage site directly on this corridor; the stepwell and the terraced ramparts are worth a long stop.",
          timingAdvice: "Zip-line closes 17:00. Arrive before 15:00 for the terrace light.",
          rating: 4.6, agent: "places",
          alternatives: [
            { id: "alt-3", name: "Neemrana Baori (stepwell)", detourMin: 9, costInr: 0, note: "Free, 20 min, spectacular geometry" },
          ],
        }),
      ],
    },
    {
      index: 2, label: "Day 2 · Neemrana to Jaipur", labelHi: "दूसरा दिन",
      startTime: "08:00", endTime: "13:30", distanceKm: 159, driveMin: 175,
      stops: [
        stop({
          id: "s-shahpura", kind: "food", name: "Shahpura Kachori Corner", nameHi: "शाहपुरा कचौरी",
          subtitle: "Pyaaz kachori, fried to order",
          coord: { lat: 27.3925, lng: 75.9987 },
          distanceFromStartKm: 198, detourMin: 4, dwellMin: 25, costInr: 180,
          why: "A legendary highway snack stop — onion kachori fried to order, 4 minutes off the road.",
          timingAdvice: "Go 10:00–12:00 when batches are freshest.",
          rating: 4.5, agent: "places",
        }),
        stop({
          id: "s-rest-1", kind: "rest", name: "Chandwaji Rest Area", nameHi: "चंदवाजी",
          subtitle: "Clean washrooms, shaded parking",
          coord: { lat: 27.0421, lng: 75.8412 },
          distanceFromStartKm: 248, detourMin: 1, dwellMin: 20, costInr: 40,
          why: "Last reliably clean facility before Jaipur's city traffic begins.",
          agent: "route",
        }),
        stop({
          id: "s-dest", kind: "destination", name: "Jaipur", nameHi: "जयपुर",
          subtitle: "The Pink City",
          coord: { lat: 26.9124, lng: 75.7873 },
          distanceFromStartKm: 281, detourMin: 0, dwellMin: 0, costInr: 0,
          why: "Arriving by 13:30 leaves the whole afternoon for Amber Fort before it closes at 17:30.",
          timingAdvice: "Amber Fort last entry 17:00.",
          agent: "route",
        }),
      ],
    },
  ],
};

/* ── 2 · Mumbai → Goa ───────────────────────────────────────────────────── */

const mumbaiGoa: Trip = {
  id: "bom-goa",
  from: "Mumbai", fromHi: "मुंबई",
  to: "Goa", toHi: "गोवा",
  intent: "Mumbai to Goa on NH66, 2 days, coastal food, no night driving",
  totalKm: 589, totalDriveMin: 720,
  fuelLitres: 49.1, fuelCostInr: 4760, tollsInr: 980, foodInr: 1900, stayInr: 3200,
  budgetInr: 14000,
  polyline: NH66_MUMBAI_GOA,
  days: [
    {
      index: 1, label: "Day 1 · Mumbai to Ratnagiri", labelHi: "पहला दिन",
      startTime: "05:30", endTime: "15:00", distanceKm: 330, driveMin: 400,
      stops: [
        stop({
          id: "g-origin", kind: "origin", name: "Mumbai", nameHi: "मुंबई",
          subtitle: "Leave before the Panvel bottleneck",
          coord: { lat: 19.076, lng: 72.8777 },
          distanceFromStartKm: 0, detourMin: 0, dwellMin: 0, costInr: 0,
          why: "A 05:30 start clears Panvel before the ghat traffic stacks up.",
          agent: "route",
        }),
        stop({
          id: "g-mahad", kind: "food", name: "Mahad Malvani Stop", nameHi: "महाड",
          subtitle: "Solkadhi, fish thali, coconut gravy",
          coord: { lat: 18.1021, lng: 73.4102 },
          distanceFromStartKm: 165, detourMin: 7, dwellMin: 50, costInr: 420,
          why: "First proper Malvani kitchen on the corridor — the coastal cooking genuinely changes south of here.",
          timingAdvice: "Fish thali sells out after 14:00.",
          rating: 4.5, agent: "places",
        }),
        stop({
          id: "g-ratnagiri", kind: "stay", name: "Ratnagiri", nameHi: "रत्नागिरी",
          subtitle: "Night halt — beaches and Alphonso country",
          coord: { lat: 17.0005, lng: 73.2891 },
          distanceFromStartKm: 330, detourMin: 12, dwellMin: 0, costInr: 3200,
          why: "The natural halfway halt. Driving past it means arriving in Goa after dark on a two-lane ghat road.",
          timingAdvice: "Do not continue past 16:00 — the NH66 ghats are unlit.",
          rating: 4.3, agent: "route",
        }),
      ],
    },
    {
      index: 2, label: "Day 2 · Ratnagiri to Goa", labelHi: "दूसरा दिन",
      startTime: "07:30", endTime: "13:00", distanceKm: 259, driveMin: 320,
      stops: [
        stop({
          id: "g-kudal", kind: "sight", name: "Sindhudurg Viewpoint", nameHi: "सिंधुदुर्ग",
          subtitle: "Sea fort on the horizon",
          coord: { lat: 16.2109, lng: 73.6801 },
          distanceFromStartKm: 470, detourMin: 18, dwellMin: 60, costInr: 150,
          why: "The Maratha sea fort is visible from the shore road — an 18-minute detour for the best coastal view of the drive.",
          rating: 4.4, agent: "places",
        }),
        stop({
          id: "g-dest", kind: "destination", name: "Goa", nameHi: "गोवा",
          subtitle: "Arrive in daylight",
          coord: { lat: 15.2993, lng: 74.124 },
          distanceFromStartKm: 589, detourMin: 0, dwellMin: 0, costInr: 0,
          why: "A 13:00 arrival gives you the afternoon and avoids the unlit final stretch.",
          agent: "route",
        }),
      ],
    },
  ],
};

/* ── 3 · Manali → Leh (the hard one: altitude, permits, weather) ────────── */

const manaliLeh: Trip = {
  id: "man-leh",
  from: "Manali", fromHi: "मनाली",
  to: "Leh", toHi: "लेह",
  intent: "Manali to Leh, 3 days, acclimatise properly, SUV",
  totalKm: 428, totalDriveMin: 960,
  fuelLitres: 47.5, fuelCostInr: 4990, tollsInr: 0, foodInr: 2400, stayInr: 6800,
  budgetInr: 22000,
  polyline: MANALI_LEH,
  days: [
    {
      index: 1, label: "Day 1 · Manali to Jispa", labelHi: "पहला दिन",
      startTime: "05:00", endTime: "13:00", distanceKm: 140, driveMin: 300,
      stops: [
        stop({
          id: "l-origin", kind: "origin", name: "Manali", nameHi: "मनाली",
          subtitle: "Atal Tunnel opens 06:00",
          coord: { lat: 32.2432, lng: 77.1892 },
          distanceFromStartKm: 0, detourMin: 0, dwellMin: 0, costInr: 0,
          why: "Start at 05:00 to be at the Atal Tunnel mouth when it opens and clear Lahaul before afternoon melt-water.",
          timingAdvice: "Streams swell after 13:00 — cross early.",
          agent: "route",
        }),
        stop({
          id: "l-jispa", kind: "stay", name: "Jispa", nameHi: "जिस्पा",
          subtitle: "3,200 m — the acclimatisation halt",
          coord: { lat: 32.7412, lng: 77.0301 },
          distanceFromStartKm: 140, detourMin: 0, dwellMin: 0, costInr: 2400,
          why: "Sleeping at Jispa (3,200 m) instead of pushing to Sarchu (4,290 m) is the single biggest reducer of altitude sickness on this route.",
          timingAdvice: "Do not sleep above 3,500 m on night one.",
          rating: 4.5, agent: "route",
        }),
      ],
    },
    {
      index: 2, label: "Day 2 · Jispa to Sarchu", labelHi: "दूसरा दिन",
      startTime: "07:00", endTime: "14:00", distanceKm: 88, driveMin: 240,
      stops: [
        stop({
          id: "l-baralacha", kind: "sight", name: "Baralacha La", nameHi: "बारालाचा ला",
          subtitle: "4,890 m pass",
          coord: { lat: 32.9101, lng: 77.1102 },
          distanceFromStartKm: 180, detourMin: 0, dwellMin: 25, costInr: 0,
          why: "The first of the high passes. Stop briefly for the Suraj Tal view but don't linger — altitude gain is steep here.",
          timingAdvice: "Max 20–25 min at this altitude.",
          rating: 4.8, agent: "places",
        }),
        stop({
          id: "l-sarchu", kind: "stay", name: "Sarchu Camps", nameHi: "सरचू",
          subtitle: "4,290 m — tented camp",
          coord: { lat: 33.2201, lng: 77.4101 },
          distanceFromStartKm: 228, detourMin: 0, dwellMin: 0, costInr: 4400,
          why: "Only viable halt in this stretch. Camps carry oxygen; confirm before booking.",
          rating: 4.0, agent: "route",
        }),
      ],
    },
    {
      index: 3, label: "Day 3 · Sarchu to Leh", labelHi: "तीसरा दिन",
      startTime: "06:30", endTime: "15:30", distanceKm: 200, driveMin: 420,
      stops: [
        stop({
          id: "l-pang", kind: "food", name: "Pang Army Canteen", nameHi: "पांग",
          subtitle: "Maggi, chai, oxygen if needed",
          coord: { lat: 33.4501, lng: 77.5312 },
          distanceFromStartKm: 290, detourMin: 0, dwellMin: 30, costInr: 220,
          why: "The only reliable hot food and medical help for 80 km in either direction.",
          rating: 4.2, agent: "places",
        }),
        stop({
          id: "l-dest", kind: "destination", name: "Leh", nameHi: "लेह",
          subtitle: "3,500 m — rest on arrival",
          coord: { lat: 34.1526, lng: 77.5771 },
          distanceFromStartKm: 428, detourMin: 0, dwellMin: 0, costInr: 0,
          why: "Plan a full rest evening. No sightseeing on arrival day.",
          agent: "route",
        }),
      ],
    },
  ],
};

export const TRIPS: Trip[] = [delhiJaipur, mumbaiGoa, manaliLeh];

/** Pick a fixture from free-text intent, so the demo feels responsive. */
export function matchTrip(intent: string): Trip {
  const q = intent.toLowerCase();
  if (/(goa|mumbai|bombay|konkan|nh66)/.test(q)) return mumbaiGoa;
  if (/(leh|ladakh|manali|spiti)/.test(q)) return manaliLeh;
  return delhiJaipur;
}
