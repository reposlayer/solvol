"use client";

import { Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DiscoveryScanner } from "@/components/terminal/DiscoveryScanner";
import { FlowAlertsPanel } from "@/components/terminal/FlowAlertsPanel";
import { MarketComparePanel } from "@/components/terminal/MarketComparePanel";
import { MarketDepthPanel } from "@/components/terminal/MarketDepthPanel";
import { MarketLensPanel } from "@/components/terminal/MarketLensPanel";
import { MarketSnapshotStrip } from "@/components/terminal/MarketSnapshotStrip";
import { NewsPulsePanel } from "@/components/terminal/NewsPulsePanel";
import { OpportunityRadar } from "@/components/terminal/OpportunityRadar";
import { ResearchDeskPanel } from "@/components/terminal/ResearchDeskPanel";
import { ResolutionQueuePanel } from "@/components/terminal/ResolutionQueuePanel";
import { ScratchpadPanel } from "@/components/terminal/ScratchpadPanel";
import { SectorPulsePanel } from "@/components/terminal/SectorPulsePanel";
import { StrategyDeckPanel } from "@/components/terminal/StrategyDeckPanel";
import { TerminalOverview } from "@/components/terminal/TerminalOverview";
import { TradeTapePanel } from "@/components/terminal/TradeTapePanel";
import { WatchlistPanel } from "@/components/terminal/WatchlistPanel";
import { useTerminal } from "@/components/terminal/terminal-context";
import { marketFocusHref } from "@/components/terminal/terminal-url";

export function WhyMoveWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const marketMatch = pathname.match(/^\/market\/([^/]+)/);
  const routeMarketId = marketMatch?.[1];

  const { marketId, setMarketId, workspaceMode } = useTerminal();
  const focusedId = routeMarketId ?? (marketId && /^\d{3,}$/.test(marketId) ? marketId : null);
  const flowFirst = workspaceMode === "flow";
  const researchFirst = workspaceMode === "research";

  function pickMarket(id: string) {
    setMarketId(id);
    if (pathname === "/terminal") {
      router.replace(marketFocusHref(window.location.search, id), { scroll: false });
      return;
    }
    router.push(marketFocusHref("", id), { scroll: false });
  }

  return (
    <div className="tscroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto p-1.5 xl:overflow-hidden">
      <div className="shrink-0">
        <TerminalOverview onSelectId={pickMarket} />
      </div>

      <div className="grid flex-1 gap-1.5 xl:min-h-0 xl:grid-cols-[minmax(300px,0.9fr)_minmax(460px,1.35fr)_minmax(320px,0.95fr)]">
        <section className="grid min-h-[430px] gap-1.5 md:min-h-[520px] xl:min-h-0 xl:grid-rows-[minmax(0,1.45fr)_minmax(180px,0.75fr)]">
          <Suspense
            fallback={
              <div className="tpanel px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
                <span className="animate-blink">▍</span> Loading scanner...
              </div>
            }
          >
            <DiscoveryScanner onSelectId={pickMarket} />
          </Suspense>
          {flowFirst ? (
            <FlowAlertsPanel onSelectId={pickMarket} />
          ) : researchFirst ? (
            <MarketComparePanel onSelectId={pickMarket} />
          ) : (
            <OpportunityRadar onSelectId={pickMarket} />
          )}
        </section>

        <section className="grid min-h-[560px] gap-1.5 md:min-h-[650px] xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_minmax(170px,0.42fr)]">
          {focusedId ? <MarketSnapshotStrip marketId={focusedId} compact /> : null}
          {researchFirst ? (
            <ResearchDeskPanel marketId={focusedId} />
          ) : (
            <MarketLensPanel marketId={focusedId} compact />
          )}
        </section>

        <section className="grid min-h-[680px] gap-1.5 xl:min-h-0 xl:grid-rows-[minmax(140px,1fr)_minmax(140px,1fr)_minmax(130px,0.95fr)_minmax(110px,0.75fr)]">
          <MarketDepthPanel marketId={focusedId} />
          <TradeTapePanel marketId={focusedId} />
          <NewsPulsePanel marketId={focusedId} />
          {researchFirst ? (
            <ScratchpadPanel />
          ) : flowFirst ? (
            <ResolutionQueuePanel onSelectId={pickMarket} />
          ) : (
            <WatchlistPanel onSelectId={pickMarket} />
          )}
        </section>

        <section className="grid gap-1.5 xl:hidden">
          <SectorPulsePanel />
          <StrategyDeckPanel onSelectId={pickMarket} />
        </section>
      </div>
    </div>
  );
}
