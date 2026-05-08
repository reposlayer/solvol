"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SidebarNav } from "@/components/terminal/SidebarNav";
import { SignalFlowWorkspace } from "@/components/terminal/SignalFlowWorkspace";
import { TerminalUrlSync } from "@/components/terminal/TerminalUrlSync";
import { useTerminal } from "@/components/terminal/terminal-context";
import { marketFocusHref } from "@/components/terminal/terminal-url";
import { DISCOVERY_DEFAULT_LIMIT } from "@/hooks/discovery-url";
import { TERMINAL_REFRESH } from "@/hooks/terminal-refresh";
import { useTerminalDiscoveryPayload } from "@/hooks/useTerminalDiscovery";
import { terminalSectionFromPath } from "@/lib/terminal/routes";

export function TerminalShell() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { marketId, setMarketId, themeMode, toggleThemeMode, watchlist, alertRules } = useTerminal();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeRoute = terminalSectionFromPath(pathname);
  const operatorQuery = useTerminalDiscoveryPayload("all_markets", { limit: DISCOVERY_DEFAULT_LIMIT });
  const navSearchParams = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );
  const focusedId = searchParams.get("marketId") ?? marketId;
  const operatorMode = operatorQuery.data?.dataMode === "mock" || operatorQuery.isError
    ? "Mock"
    : operatorQuery.isLoading
      ? "Loading"
      : "Live";
  const operatorSourceState = operatorMode === "Mock" ? "Sources degraded" : "Sources healthy";
  const operatorMarketCount = operatorQuery.data?.items.length ?? 0;

  function selectMarket(id: string) {
    setMarketId(id);
    router.push(marketFocusHref(searchParams.toString(), id));
  }

  return (
    <div className="terminal-market-app-shell" data-terminal-theme={themeMode}>
      <TerminalUrlSync />
      <button
        type="button"
        className="terminal-mobile-sidebar-toggle"
        aria-expanded={sidebarOpen}
        aria-controls="terminal-primary-sidebar"
        onClick={() => setSidebarOpen((open) => !open)}
      >
        Sections
      </button>
      {sidebarOpen ? (
        <button
          type="button"
          className="terminal-sidebar-backdrop"
          aria-label="Close terminal navigation"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside
        id="terminal-primary-sidebar"
        className={`terminal-market-sidebar terminal-primary-sidebar${sidebarOpen ? " is-open" : ""}`}
      >
        <div className="terminal-market-sidebar-brand">
          <span>Solvol Terminal</span>
          <strong>Prediction market intelligence</strong>
          <em>Read-only public Polymarket data</em>
        </div>
        <SidebarNav
          activeId={activeRoute?.id}
          searchParams={navSearchParams}
          marketId={marketId}
          onNavigate={() => setSidebarOpen(false)}
        />
        <div className="terminal-sidebar-operator-mini-bar terminal-operator-mini-bar" aria-label="Operator status">
          <span>{operatorMode}</span>
          <span>{operatorSourceState}</span>
          <span>Last refresh {Math.round(TERMINAL_REFRESH.discovery.refetchIntervalMs / 1000)}s</span>
          <span>{operatorMarketCount} markets loaded</span>
        </div>
        <div className="terminal-sidebar-status" aria-label="Terminal status">
          <span>
            <em>Mode</em>
            <strong>Read-only market intelligence</strong>
          </span>
          <span>
            <em>Focused market</em>
            <Link className="terminal-sidebar-focus-link" href={marketFocusHref(searchParams.toString(), marketId)}>
              {marketId}
            </Link>
          </span>
          <span className="terminal-sidebar-watchlist-summary">
            <em>Local workspace</em>
            <strong>{watchlist.length} watched / {alertRules.length} alerts</strong>
          </span>
        </div>
      </aside>
      <main className="terminal-market-content">
        <div className="live-desk-beta-bar">
          <strong>Read-only market intelligence</strong>
          <span>Live public data with deterministic fallback</span>
          <button type="button" onClick={toggleThemeMode}>
            {themeMode === "dark" ? "Light" : "Dark"}
          </button>
          <Link href={marketFocusHref(searchParams.toString(), marketId)}>Market {marketId}</Link>
        </div>
        <SignalFlowWorkspace focusedId={focusedId} onSelectMarket={selectMarket} />
      </main>
    </div>
  );
}
