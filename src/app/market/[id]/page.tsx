import { Suspense } from "react";
import { TerminalProvider } from "@/components/terminal/terminal-context";
import { TerminalShell } from "@/components/terminal/TerminalShell";

export default async function MarketTerminalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <TerminalProvider key={id} initialMarketId={id}>
        <TerminalShell />
      </TerminalProvider>
    </Suspense>
  );
}
