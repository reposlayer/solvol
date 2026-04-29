"use client";

import { Suspense } from "react";
import { TerminalHeader } from "@/components/terminal/TerminalHeader";
import { TerminalUrlSync } from "@/components/terminal/TerminalUrlSync";
import { TerminalTape } from "@/components/terminal/TerminalTape";
import { WhyMoveWorkspace } from "@/components/terminal/WhyMoveWorkspace";
import { TerminalStatusBar } from "@/components/terminal/TerminalStatusBar";
import { useTerminal } from "@/components/terminal/terminal-context";

function CommandEchoStrip() {
  const { commandEcho, setCommandEcho } = useTerminal();
  if (!commandEcho) return null;
  return (
    <div className="flex shrink-0 items-start gap-2 border-t border-[var(--terminal-border)] bg-[var(--terminal-panel-2)] px-3 py-1 font-mono text-[10px] text-[var(--terminal-text-2)]">
      <span className="shrink-0 text-[var(--terminal-cyan)]">›</span>
      <pre className="min-w-0 flex-1 whitespace-pre-wrap">{commandEcho}</pre>
      <button
        type="button"
        className="shrink-0 text-[var(--terminal-muted)] hover:text-[var(--terminal-text)]"
        onClick={() => setCommandEcho(null)}
        aria-label="Dismiss command output"
      >
        ×
      </button>
    </div>
  );
}

export function TerminalShell() {
  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[var(--terminal-bg)] text-[var(--terminal-text)]">
      <Suspense fallback={null}>
        <TerminalUrlSync />
      </Suspense>
      <Suspense fallback={null}>
        <TerminalHeader />
      </Suspense>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--terminal-bg)]">
        <WhyMoveWorkspace />
      </main>
      <CommandEchoStrip />
      <TerminalStatusBar />
      <TerminalTape />
    </div>
  );
}
