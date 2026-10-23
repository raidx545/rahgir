import { useNavigate } from "react-router-dom";
import { Bot, ArrowRight, MapPin } from "lucide-react";
import ChatBox from "../components/ChatBox";
import { useTrips } from "../trips";

export default function Assistant() {
  const navigate = useNavigate();
  const trips = useTrips();
  const latest = trips[0]; // most-recently opened

  return (
    <div className="max-w-[720px] mx-auto">
      <div className="mb-6">
        <p className="kicker">Assistant</p>
        <h1 className="text-ink text-[32px] leading-10 font-semibold mt-1">Ask Rahgir</h1>
        <p className="text-muted text-[15px] mt-1">
          Your local friend for the road. Ask about stops, food, timing, and detours on your
          latest journey.
        </p>
      </div>

      {latest ? (
        <div className="bg-white border border-line rounded-xl shadow-card p-6">
          <button
            onClick={() => navigate(`/dashboard?trip=${latest.trip_id}`)}
            className="w-full flex items-center justify-between gap-2 mb-4 text-left group"
          >
            <span className="flex items-center gap-2 text-ink font-serif text-[18px]">
              <MapPin className="size-4 text-rust" />
              {latest.start} → {latest.destination}
            </span>
            <span className="text-rust text-[13px] font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
              Open <ArrowRight className="size-3.5" />
            </span>
          </button>
          <ChatBox
            tripId={latest.trip_id}
            greeting={`Ask me anything about your ${latest.start} → ${latest.destination} journey.`}
            maxHeight="24rem"
          />
        </div>
      ) : (
        <div className="bg-white border border-line rounded-xl shadow-card p-10 text-center">
          <Bot className="size-8 text-rust mx-auto mb-3" />
          <p className="text-ink text-[18px] font-serif font-semibold">No journey to chat about yet</p>
          <p className="text-muted text-[14px] mt-1 mb-5">
            Plan a route first — then I can answer questions grounded in your itinerary.
          </p>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 bg-ink text-white rounded-xl px-6 py-3 text-[15px] shadow-btn hover:brightness-125 transition"
          >
            Plan a Journey <ArrowRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
