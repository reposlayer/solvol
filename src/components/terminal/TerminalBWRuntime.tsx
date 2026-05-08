"use client";

import { TerminalShell } from "@/components/terminal/TerminalShell";

/**
 * Compatibility entrypoint for older imports.
 * Rendering is delegated to the active market-first terminal shell.
 */
export function TerminalBWRuntime() {
  return <TerminalShell />;
}
