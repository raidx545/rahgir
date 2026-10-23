import { useEffect, useRef, useState } from "react";
import { Send, Bot } from "lucide-react";
import { askTripStream } from "../api";

type ChatMsg = { role: "user" | "assistant"; text: string };

/** Streaming Q&A chat grounded on a trip. Used in the dashboard + assistant page. */
export default function ChatBox({
  tripId,
  greeting,
  className = "",
  maxHeight = "10rem",
}: {
  tripId: string;
  greeting: string;
  className?: string;
  maxHeight?: string;
}) {
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([{ role: "assistant", text: greeting }]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const q = msg.trim();
    if (!q || busy) return;
    setMsg("");
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "" }]);
    setBusy(true);
    const setLast = (text: string) =>
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", text };
        return copy;
      });
    try {
      if (tripId === "demo") {
        setLast("This is a demo trip — plan a real route to chat with the assistant.");
      } else {
        await askTripStream(tripId, q, (full) => setLast(full));
      }
    } catch (e) {
      setLast(`Sorry — ${e instanceof Error ? e.message : "something went wrong."}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <div
        ref={scrollRef}
        className="overflow-y-auto flex flex-col gap-3 mb-3 pr-1"
        style={{ maxHeight }}
      >
        {messages.map((m, i) =>
          m.role === "assistant" ? (
            <div key={i} className="flex gap-3">
              <div className="size-8 shrink-0 rounded-full bg-ink flex items-center justify-center">
                <Bot className="size-4 text-white" />
              </div>
              <div className="bg-white border border-line rounded-xl shadow-subtle px-3 py-2 text-[14px] text-muted leading-5 min-w-0">
                {m.text || (busy && i === messages.length - 1 ? "…" : m.text)}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-end">
              <div className="bg-ink text-white rounded-xl px-3 py-2 text-[14px] leading-5 max-w-[85%]">
                {m.text}
              </div>
            </div>
          ),
        )}
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-field bg-white px-4 py-2">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about the next stop..."
          className="flex-1 bg-transparent outline-none text-[14px] text-ink placeholder:text-muted"
        />
        <button
          onClick={send}
          disabled={busy || !msg.trim()}
          className="size-7 rounded-full bg-ink text-white flex items-center justify-center hover:brightness-125 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
