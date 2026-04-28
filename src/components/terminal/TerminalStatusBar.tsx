"use client";

import { useTerminal } from "@/components/terminal/terminal-context";

export function TerminalStatusBar() {
  const { marketId, workspaceMode, watchlist, loading, error, result } = useTerminal();
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-[var(--terminal-border)] bg-[var(--terminal-panel-2)] px-2 font-mono text-[10px] text-[var(--terminal-muted)]">
      <span className="terminal-led" />
      <span className="uppercase tracking-wide text-[var(--terminal-text-2)]">Solvol OS</span>
      <span className="tnum">focus #{marketId}</span>
      <span className="uppercase">mode {workspaceMode}</span>
      <span className="tnum">pins {watchlist.length}</span>
      <span className={loading ? "text-[var(--terminal-amber)]" : error ? "text-[var(--terminal-down)]" : "text-[var(--terminal-up)]"}>
        {loading ? "catalyst running" : error ? "catalyst error" : result ? "catalyst ranked" : "catalyst idle"}
      </span>
      <span className="ml-auto hidden uppercase tracking-wide text-[var(--terminal-dim)] sm:inline">
        terminal build c1174bd+
      </span>
    </div>
  );
}
