"use client";

import { TerminalShell } from "@/components/terminal/TerminalShell";

/**
 * Compatibility entrypoint for older Bloomberg-named imports.
 * The routed Solvol terminal remains the market-first read-only runtime.
 */
export function BloombergTerminalRuntime() {
  return <TerminalShell />;
}
