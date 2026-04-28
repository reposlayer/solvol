"use client";

import { useState } from "react";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { useTerminal } from "@/components/terminal/terminal-context";

const NOTE_KEY = "solvol:terminal:scratchpad";
const CHECKS_KEY = "solvol:terminal:checks";

const CHECKS = [
  "criteria",
  "liquidity",
  "catalyst",
  "hedge",
  "exit",
] as const;

export function ScratchpadPanel() {
  const { marketId, commandHistory } = useTerminal();
  const [note, setNote] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(NOTE_KEY) ?? "",
  );
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const parsed = JSON.parse(window.localStorage.getItem(CHECKS_KEY) ?? "{}") as Record<string, boolean>;
      return parsed;
    } catch {
      return {};
    }
  });

  function saveNote(next: string) {
    setNote(next);
    window.localStorage.setItem(NOTE_KEY, next);
  }

  function toggleCheck(key: string) {
    setChecks((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      window.localStorage.setItem(CHECKS_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <PanelFrame
      fkey="F11"
      title="Desk Notes"
      subtitle={`focus #${marketId}`}
      scroll
    >
      <div className="space-y-2 p-2">
        <div className="grid grid-cols-5 gap-1">
          {CHECKS.map((check) => (
            <button
              type="button"
              key={check}
              onClick={() => toggleCheck(check)}
              className={`rounded-sm border px-1 py-1 font-mono text-[9px] uppercase tracking-wide ${
                checks[check]
                  ? "border-[var(--terminal-up)]/60 bg-[var(--terminal-up-soft)] text-[var(--terminal-up)]"
                  : "border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] text-[var(--terminal-muted)] hover:text-[var(--terminal-text-2)]"
              }`}
            >
              {check}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(event) => saveNote(event.target.value)}
          className="h-32 w-full resize-none rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2 font-mono text-[11px] leading-relaxed text-[var(--terminal-text)] outline-none placeholder:text-[var(--terminal-muted)] focus:border-[var(--terminal-cyan)]/60"
          placeholder="desk note..."
        />
        {commandHistory.length ? (
          <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--terminal-muted)]">
              Recent Commands
            </div>
            <div className="flex flex-wrap gap-1">
              {commandHistory.slice(0, 8).map((cmd) => (
                <span
                  key={cmd}
                  className="max-w-full truncate rounded-sm border border-[var(--terminal-border)] px-1.5 py-[1px] font-mono text-[9.5px] text-[var(--terminal-text-2)]"
                >
                  {cmd}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </PanelFrame>
  );
}
