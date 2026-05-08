"use client";

import { TerminalShell } from "@/components/terminal/TerminalShell";

/**
 * Legacy Polymarket entrypoint retained for imports only.
 * Rendering is delegated to the market-first read-only terminal shell.
 */
export function PolymarketTerminal() {
  return <TerminalShell />;
}
