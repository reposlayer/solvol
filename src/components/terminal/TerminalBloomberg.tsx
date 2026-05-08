"use client";

import { TerminalShell } from "@/components/terminal/TerminalShell";

/**
 * Compatibility export for older route entrypoints.
 * The active terminal product shell is TerminalShell.
 */
export function TerminalBloomberg() {
  return <TerminalShell />;
}
