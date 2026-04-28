"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useTerminal } from "@/components/terminal/terminal-context";
import { DiscoveryScanner } from "@/components/terminal/DiscoveryScanner";
import { MarketSnapshotStrip } from "@/components/terminal/MarketSnapshotStrip";
import { TerminalOverview } from "@/components/terminal/TerminalOverview";
import { MarketLensPanel } from "@/components/terminal/MarketLensPanel";
import { FlowAlertsPanel } from "@/components/terminal/FlowAlertsPanel";
import { OpportunityRadar } from "@/components/terminal/OpportunityRadar";
import { SectorPulsePanel } from "@/components/terminal/SectorPulsePanel";
import { ResolutionQueuePanel } from "@/components/terminal/ResolutionQueuePanel";
import { WatchlistPanel } from "@/components/terminal/WatchlistPanel";
import { StrategyDeckPanel } from "@/components/terminal/StrategyDeckPanel";
import { ScratchpadPanel } from "@/components/terminal/ScratchpadPanel";
import { MarketComparePanel } from "@/components/terminal/MarketComparePanel";
import { ResearchDeskPanel } from "@/components/terminal/ResearchDeskPanel";

export function WhyMoveWorkspace() {
  const pathname = usePathname();
  const marketMatch = pathname.match(/^\/market\/([^/]+)/);
  const routeMarketId = marketMatch?.[1];

  const { marketId, runExplainWithId, workspaceMode } = useTerminal();
  const focusedId = routeMarketId ?? (marketId && /^\d{3,}$/.test(marketId) ? marketId : null);
  const pickMarket = (id: string) => void runExplainWithId(id);
  const flowFirst = workspaceMode === "flow";
  const researchFirst = workspaceMode === "research";

  return (
    <div className="tscroll flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
      <TerminalOverview onSelectId={pickMarket} />

      <div className="grid min-h-[1250px] flex-1 gap-2 2xl:min-h-0 2xl:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.8fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          {focusedId ? (
            <div className="shrink-0">
              <MarketSnapshotStrip marketId={focusedId} />
            </div>
          ) : null}

          {researchFirst ? (
            <div className="min-h-[280px]">
              <ResearchDeskPanel marketId={focusedId} />
            </div>
          ) : null}

          {flowFirst ? (
            <div className="grid min-h-[260px] gap-2 xl:grid-cols-2">
              <OpportunityRadar onSelectId={pickMarket} />
              <FlowAlertsPanel onSelectId={pickMarket} />
            </div>
          ) : null}

          <div className="min-h-[380px] flex-1">
            <Suspense
              fallback={
                <div className="tpanel px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
                  <span className="animate-blink">▍</span> Loading scanner…
                </div>
              }
            >
              <DiscoveryScanner onSelectId={pickMarket} />
            </Suspense>
          </div>

          <div className="grid min-h-[300px] gap-2 xl:grid-cols-2">
            {researchFirst ? (
              <>
                <MarketComparePanel onSelectId={pickMarket} />
                <StrategyDeckPanel onSelectId={pickMarket} />
              </>
            ) : flowFirst ? (
              <>
                <MarketComparePanel onSelectId={pickMarket} />
                <SectorPulsePanel />
              </>
            ) : (
              <>
                <OpportunityRadar onSelectId={pickMarket} />
                <SectorPulsePanel />
              </>
            )}
          </div>
        </div>

        <div className="grid min-h-0 gap-2 lg:grid-cols-2 2xl:grid-cols-1">
          {researchFirst ? (
            <>
              <MarketLensPanel marketId={focusedId} />
              <WatchlistPanel onSelectId={pickMarket} />
              <SectorPulsePanel />
              <ScratchpadPanel />
              <ResolutionQueuePanel onSelectId={pickMarket} />
            </>
          ) : flowFirst ? (
            <>
              <ResolutionQueuePanel onSelectId={pickMarket} />
              <WatchlistPanel onSelectId={pickMarket} />
              <SectorPulsePanel />
              <StrategyDeckPanel onSelectId={pickMarket} />
              <ScratchpadPanel />
            </>
          ) : (
            <>
              <ResearchDeskPanel marketId={focusedId} />
              <MarketLensPanel marketId={focusedId} />
              <FlowAlertsPanel onSelectId={pickMarket} />
              <WatchlistPanel onSelectId={pickMarket} />
              <ResolutionQueuePanel onSelectId={pickMarket} />
              <StrategyDeckPanel onSelectId={pickMarket} />
              <ScratchpadPanel />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
