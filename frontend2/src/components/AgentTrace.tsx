import { motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { AGENTS } from "@/api/fixtures";
import type { AgentId, AgentStatus } from "@/api/types";
import { usePrefersReducedMotion } from "@/hooks/useTheme";

export type AgentState = { status: AgentStatus; message: string };

/**
 * The multi-agent work, made legible.
 * Each row is a REAL LangGraph node in the backend pipeline; status changes
 * arrive over NDJSON as each node completes. Nothing here is simulated.
 */
export function AgentTrace({ states }: { states: Record<AgentId, AgentState> }) {
  const reduced = usePrefersReducedMotion();

  return (
    <ol className="flex flex-col">
      {AGENTS.map((a, i) => {
        const st = states[a.id];
        const done = st.status === "done";
        const running = st.status === "running";
        const failed = st.status === "failed";

        const dotColor = failed
          ? "var(--color-agent-failed)"
          : done
            ? "var(--color-agent-done)"
            : running
              ? "var(--color-agent-running)"
              : "var(--color-agent-idle)";

        return (
          <li key={a.id} className="relative flex gap-4">
            {/* the rail — a road running down the left */}
            <div className="relative flex w-[18px] flex-none justify-center">
              {i < AGENTS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-[22px] bottom-0 w-[2px]"
                  style={{
                    background: done ? "var(--color-agent-done)" : "var(--color-border)",
                    transition: "background var(--dur-page) var(--p-ease-power1-out)",
                  }}
                />
              )}
              <span
                aria-hidden
                className="relative z-10 mt-[13px] flex size-[18px] items-center justify-center rounded-full"
                style={{
                  background: running || done || failed ? dotColor : "var(--color-surface)",
                  border: `2px solid ${dotColor}`,
                  transition: "all var(--dur-page) var(--p-ease-power1-out)",
                }}
              >
                {done && <Check className="size-[11px]" style={{ color: "var(--color-on-primary)" }} />}
                {failed && <X className="size-[11px]" style={{ color: "var(--color-on-marker)" }} />}
                {running && !reduced && (
                  <Loader2 className="size-[11px] animate-spin" style={{ color: "var(--color-on-band)" }} />
                )}
              </span>
            </div>

            <motion.div
              initial={reduced ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: st.status === "idle" ? 0.45 : 1, x: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="min-w-0 flex-1 pb-6"
              style={{ minHeight: "var(--agent-row-h)" }}
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="deva text-[17px]" style={{ color: "var(--color-foreground)", fontWeight: 600 }}>
                  {a.labelHi}
                </span>
                <span className="sign-caps text-[11px]" style={{ color: "var(--color-muted-foreground)" }}>
                  {a.label}
                </span>
              </div>
              <p
                className="mt-0.5 text-[0.875rem] leading-5"
                style={{
                  color: failed ? "var(--color-destructive)" : "var(--color-muted-foreground)",
                }}
              >
                {st.message || a.verb}
              </p>
            </motion.div>
          </li>
        );
      })}
    </ol>
  );
}

export const initialAgentStates = (): Record<AgentId, AgentState> =>
  AGENTS.reduce(
    (acc, a) => ({ ...acc, [a.id]: { status: "idle" as AgentStatus, message: "" } }),
    {} as Record<AgentId, AgentState>,
  );
