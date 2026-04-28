"use client";

import { TerminalProvider } from "@/components/terminal/terminal-context";
import { TerminalShell } from "@/components/terminal/TerminalShell";
import { useParams } from "next/navigation";

export default function MarketTerminalPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "540816";

  return (
    <TerminalProvider key={id} initialMarketId={id}>
      <TerminalShell />
    </TerminalProvider>
  );
}
