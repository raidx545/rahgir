import { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { item, stagger } from "../motion";

// Simple local travel journal — freeform notes persisted in localStorage.
interface Note {
  id: string;
  text: string;
  ts: number;
}
const KEY = "rahgir.journal";
const listeners = new Set<() => void>();
let snapRaw = "";
let snapVal: Note[] = [];
const read = (): Note[] => {
  const raw = localStorage.getItem(KEY) || "[]";
  if (raw === snapRaw) return snapVal;
  try {
    snapVal = JSON.parse(raw);
  } catch {
    snapVal = [];
  }
  snapRaw = raw;
  return snapVal;
};
const write = (n: Note[]) => {
  localStorage.setItem(KEY, JSON.stringify(n));
  listeners.forEach((l) => l());
};
const useNotes = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    read,
  );

export default function Journal() {
  const notes = useNotes();
  const [draft, setDraft] = useState("");

  function add() {
    const text = draft.trim();
    if (!text) return;
    write([{ id: crypto.randomUUID(), text, ts: Date.now() }, ...read()]);
    setDraft("");
  }

  return (
    <div className="max-w-[720px] mx-auto">
      <div className="mb-6">
        <p className="kicker">Journal</p>
        <h1 className="text-ink text-[32px] leading-10 font-semibold mt-1">Travel Journal</h1>
        <p className="text-muted text-[15px] mt-1">Jot down memories, tips, and moments from the road.</p>
      </div>

      <div className="bg-white border border-line rounded-xl shadow-subtle p-4 mb-6 flex items-start gap-3">
        <BookOpen className="size-5 text-rust mt-2 shrink-0" />
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
          }}
          placeholder="What happened on the way? (⌘/Ctrl + Enter to save)"
          rows={2}
          className="flex-1 bg-transparent outline-none text-ink text-[15px] resize-none py-1.5"
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          className="shrink-0 inline-flex items-center gap-1.5 bg-ink text-white rounded-lg px-4 py-2 text-[14px] font-semibold hover:brightness-125 transition disabled:opacity-40"
        >
          <Plus className="size-4" /> Add
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-muted text-[14px] text-center py-8 italic">
          No entries yet — your road stories will appear here.
        </p>
      ) : (
        <motion.div variants={stagger} initial="initial" animate="animate" className="flex flex-col gap-3">
          {notes.map((n) => (
            <motion.div
              key={n.id}
              variants={item}
              className="bg-white border border-line rounded-xl shadow-subtle p-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-ink text-[15px] leading-6 whitespace-pre-wrap">{n.text}</p>
                <p className="text-dust text-[12px] mt-2">
                  {new Date(n.ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
              <button
                onClick={() => write(read().filter((x) => x.id !== n.id))}
                className="p-1.5 rounded-lg hover:bg-sand transition text-muted shrink-0"
                title="Delete"
              >
                <Trash2 className="size-4" />
              </button>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
