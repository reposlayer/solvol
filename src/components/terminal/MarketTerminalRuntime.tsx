"use client";

import { TerminalShell } from "@/components/terminal/TerminalShell";

/**
 * Compatibility shim for the historical runtime name.
 */
export function MarketTerminalRuntime() {
  return <TerminalShell />;
}
