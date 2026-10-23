import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, Clock, Star, Trash2, Compass, ArrowRight } from "lucide-react";
import { useTrips, toggleSave, removeTrip } from "../trips";
import { fmtDuration } from "../api";
import { stagger, item } from "../motion";

export default function TripsList({ mode }: { mode: "all" | "saved" }) {
  const navigate = useNavigate();
  const all = useTrips();
  const trips = mode === "saved" ? all.filter((t) => t.saved) : all;

  const title = mode === "saved" ? "Saved Journeys" : "Your Routes";
  const subtitle =
    mode === "saved"
      ? "Trips you've starred to revisit."
      : "Every journey you've planned. Pick up where you left off.";

  return (
    <div className="max-w-[900px] mx-auto">
      <div className="mb-8">
        <p className="kicker">{mode === "saved" ? "Saved" : "History"}</p>
        <h1 className="text-ink text-[32px] leading-10 font-semibold mt-1">{title}</h1>
        <p className="text-muted text-[15px] mt-1">{subtitle}</p>
      </div>

      {trips.length === 0 ? (
        <div className="bg-white border border-line rounded-xl shadow-card p-10 text-center">
          <Compass className="size-8 text-rust mx-auto mb-3" />
          <p className="text-ink text-[18px] font-serif font-semibold">
            {mode === "saved" ? "Nothing saved yet" : "No journeys yet"}
          </p>
          <p className="text-muted text-[14px] mt-1 mb-5">
            {mode === "saved"
              ? "Star a trip from its dashboard to keep it here."
              : "Plan your first route to see it here."}
          </p>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 bg-ink text-white rounded-xl px-6 py-3 text-[15px] shadow-btn hover:brightness-125 transition"
          >
            Plan a Journey <ArrowRight className="size-4" />
          </button>
        </div>
      ) : (
        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          className="grid sm:grid-cols-2 gap-4"
        >
          {trips.map((t) => (
            <motion.div
              key={t.trip_id}
              variants={item}
              className="group bg-white border border-line rounded-xl shadow-subtle p-5 hover:border-rust/50 transition cursor-pointer"
              onClick={() => navigate(`/dashboard?trip=${t.trip_id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-ink text-[20px] leading-7 font-serif">
                  {t.start} <span className="text-dust">→</span> {t.destination}
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    title={t.saved ? "Unsave" : "Save"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSave(t.trip_id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-sand transition"
                  >
                    <Star
                      className={`size-[18px] ${t.saved ? "fill-rust text-rust" : "text-muted"}`}
                    />
                  </button>
                  <button
                    title="Remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTrip(t.trip_id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-sand transition text-muted"
                  >
                    <Trash2 className="size-[16px]" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-muted text-[13px]">
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {Math.round(t.total_distance_km)} km · {fmtDuration(t.total_duration_min)}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {t.stops} stops
                </span>
              </div>
              {t.themes?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {t.themes.map((th) => (
                    <span
                      key={th}
                      className="rounded-full bg-forest/10 text-forest text-[11px] font-semibold px-2 py-0.5 capitalize"
                    >
                      {th}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
