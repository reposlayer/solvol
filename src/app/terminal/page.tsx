import { Suspense } from "react";
import { TerminalProvider } from "@/components/terminal/terminal-context";
import { TerminalShell } from "@/components/terminal/TerminalShell";

export default function TerminalPage() {
  return (
    <Suspense fallback={null}>
      <TerminalProvider>
        <TerminalShell />
      </TerminalProvider>
    </Suspense>
  );
}
