"use client";

import { TerminalProvider } from "@/components/terminal/terminal-context";
import { TerminalShell } from "@/components/terminal/TerminalShell";

export default function TerminalPage() {
  return (
    <TerminalProvider>
      <TerminalShell />
    </TerminalProvider>
  );
}
