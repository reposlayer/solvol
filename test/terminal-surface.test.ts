import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

test("/terminal renders the market-first route shell without institutional indirection", async () => {
  const shell = await readFile("src/components/terminal/TerminalShell.tsx", "utf8");
  const urlSync = await readFile("src/components/terminal/TerminalUrlSync.tsx", "utf8");
  const sectionPage = await readFile("src/app/terminal/[section]/page.tsx", "utf8");
  const marketPage = await readFile("src/app/terminal/market/[id]/page.tsx", "utf8");
  const publicMarketPage = await readFile("src/app/market/[id]/page.tsx", "utf8");
  const context = await readFile("src/components/terminal/terminal-context.tsx", "utf8");
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");
  const topCommandBar = await readFile("src/components/terminal/TopCommandBar.tsx", "utf8");
  const tsconfig = await readFile("tsconfig.json", "utf8");

  for (const marker of [
    "SignalFlowWorkspace",
    "SidebarNav",
    "TerminalUrlSync",
    "terminal-primary-sidebar",
    "terminal-market-app-shell",
    "live-desk-beta-bar",
    "terminal-sidebar-operator-mini-bar",
    "Read-only market intelligence",
    "marketFocusHref",
    "useTerminalDiscoveryPayload",
  ]) {
    assert.match(shell, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(shell, /InstitutionalPolymarketTerminal|terminal-institutional-portal|createPortal|NEXT_PUBLIC_SOLVOL_LEGACY_TERMINAL/);
  assert.doesNotMatch(shell, /trade execution|order placement|withdraw|custody/i);
  assert.match(urlSync, /return null;/);
  assert.doesNotMatch(urlSync, /InstitutionalPolymarketTerminal/);
  assert.match(sectionPage, /TERMINAL_ROUTES/);
  assert.match(sectionPage, /terminalRouteById/);
  assert.doesNotMatch(sectionPage, /POLYMARKET_TERMINAL_ROUTES|polymarketTerminalRouteById/);
  assert.match(marketPage, /TerminalShell/);
  assert.match(publicMarketPage, /TerminalShell/);
  assert.match(context, /<TerminalContext\.Provider value=\{value\}>\s*\{children\}\s*<\/TerminalContext\.Provider>/);
  assert.doesNotMatch(context, /InstitutionalPolymarketTerminal/);
  assert.doesNotMatch(workspace, /import \{ InstitutionalPolymarketTerminal \}/);
  assert.doesNotMatch(workspace, /NEXT_PUBLIC_SOLVOL_LEGACY_TERMINAL/);
  assert.doesNotMatch(workspace, /return <InstitutionalPolymarketTerminal/);
  assert.doesNotMatch(workspace, /function LegacySignalFlowWorkspace/);
  assert.doesNotMatch(topCommandBar, /InstitutionalPolymarketTerminal|NEXT_PUBLIC_SOLVOL_LEGACY_TERMINAL|terminal-institutional-portal|createPortal/);
  assert.doesNotMatch(tsconfig, /"@\/components\/terminal\/TopCommandBar"[\s\S]*InstitutionalTopCommandBar/);
});

test("terminal design is applied through the routed shell, not a standalone mockup shell", async () => {
  const componentFiles = await readdir("src/components/terminal");
  const css = await readFile("src/app/globals.css", "utf8");
  const mockData = await readFile("src/lib/polymarket/mockData.ts", "utf8");
  const polymarketTypes = await readFile("src/lib/polymarket/types.ts", "utf8");
  const compatibilityEntrypoints = await Promise.all([
    readFile("src/components/terminal/TerminalBloomberg.tsx", "utf8"),
    readFile("src/components/terminal/BloombergTerminalRuntime.tsx", "utf8"),
    readFile("src/components/terminal/TerminalBWRuntime.tsx", "utf8"),
    readFile("src/components/terminal/MarketTerminalRuntime.tsx", "utf8"),
    readFile("src/components/terminal/PolymarketTerminal.tsx", "utf8"),
    readFile("src/components/terminal/MarketFirstTerminalShell.tsx", "utf8"),
  ]);

  assert.equal(componentFiles.includes("InstitutionalPolymarketTerminal.tsx"), false);
  assert.equal(componentFiles.includes("OrderTicket.tsx"), false);
  assert.doesNotMatch(css, /terminal-bloomberg-shell|:has\(\.terminal-bloomberg-shell\)|--term-/);
  assert.doesNotMatch(mockData, /estimateOrderPreview|buildMockPositions|PolymarketOrderPreview|PolymarketOrderSide/);
  assert.doesNotMatch(polymarketTypes, /PolymarketOrderPreview|PolymarketOrderSide/);
  assert.doesNotMatch(
    compatibilityEntrypoints.join("\n"),
    /terminal-bloomberg-shell|terminal-sidebar, terminal-topbar|POLYMARKET_TERMINAL_ROUTES|OrderTicket|order ticket/i,
  );
});

test("terminal product redesign uses one primary sidebar and route workspaces", async () => {
  const shell = await readFile("src/components/terminal/TerminalShell.tsx", "utf8");
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");
  const routes = await readFile("src/lib/terminal/routes.ts", "utf8");
  const css = await readFile("src/app/globals.css", "utf8");

  for (const marker of [
    "terminal-market-app-shell",
    "terminal-market-sidebar",
    "terminal-mobile-sidebar-toggle",
    "terminal-market-content",
    "terminal-primary-sidebar",
    "terminal-sidebar-operator-mini-bar",
    "renderActiveWorkspace",
    "Market Detail",
    "All Markets",
    "Movers",
    "Sources",
    "Alerts",
    "Watchlist",
    "Data Sources",
  ]) {
    assert.match(shell + workspace + routes + css, new RegExp(marker));
  }

  assert.match(css, /\.terminal-market-app-shell\s*\{[\s\S]*grid-template-columns:\s*258px minmax\(0,\s*1fr\)/);
  assert.match(css, /\.terminal-market-sidebar\s*\{[\s\S]*position:\s*sticky/);
  assert.match(css, /\.terminal-why-badge\.is-up\s*\{[\s\S]*color:\s*var\(--terminal-up\)/);
  assert.match(css, /\.terminal-why-badge\.is-warn\s*\{[\s\S]*color:\s*var\(--terminal-amber\)/);
  assert.match(css, /\.terminal-why-badge\.is-neutral\s*\{[\s\S]*color:\s*var\(--terminal-muted\)/);
  assert.match(css, /\.terminal-why-badge\.is-blue\s*\{[\s\S]*color:\s*var\(--terminal-cyan\)/);
  assert.match(css, /@media \(max-width:\s*980px\)[\s\S]*\.terminal-market-app-shell\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /@media \(max-width:\s*980px\)[\s\S]*\.terminal-market-sidebar\s*\{[\s\S]*position:\s*fixed/);
});

test("all markets table exposes intelligence badges, saved views, compare, provenance and keyboard ergonomics", async () => {
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");
  const css = await readFile("src/app/globals.css", "utf8");
  const turbo = await readFile("src/components/terminal/terminal-turbo.ts", "utf8");

  for (const marker of [
    "terminal-why-badge",
    "Move explained",
    "Needs source",
    "Low confidence",
    "Official source",
    "terminal-source-count-button",
    "terminal-saved-view-bar",
    "MARKET_TABLE_SHARE_KEYS",
    "next.delete(key)",
    "High Volume",
    "Closing 24h",
    "Crypto",
    "Watchlist + Movers",
    "Share view",
    "terminal-market-compare-drawer",
    "Compare 2-4 markets",
    "Source density",
    "terminal-provenance-drawer",
    "terminal-operator-mini-bar",
    "Sources degraded",
    "Last refresh",
    "markets loaded",
    "Raw links",
    "checksum",
    "adapter",
    "score breakdown",
    "ArrowDown",
    "ArrowUp",
    'event.key === "/"',
    'event.key.toLowerCase() === "w"',
  ]) {
    assert.match(workspace + css + turbo, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("why-moved cards expose evidence quality and conflicting evidence metadata", async () => {
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");

  for (const marker of [
    "Evidence status",
    "Move quality",
    "Market divergence",
    "Conflicting evidence",
    "candidate.evidenceStatus",
    "candidate.moveQuality",
    "candidate.marketDivergence",
    "candidate.conflictingNewsItemIds",
  ]) {
    assert.match(workspace, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("terminal shell shows read-only account, navigation and fallback polish", async () => {
  const shell = await readFile("src/components/terminal/TerminalShell.tsx", "utf8");
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");
  const systemStatus = await readFile("src/components/terminal/SystemStatusPanel.tsx", "utf8");
  const css = await readFile("src/app/globals.css", "utf8");

  for (const marker of [
    "Read-only market intelligence",
    "Live public data with deterministic fallback",
    "Live unavailable, demo data shown",
    "terminal-fallback-notice",
    "Suggested alert from this market move",
    "read-only rule",
    "Create local draft",
    "Pinned markets appear here",
    "terminal-sidebar-status",
    "terminal-command-palette",
  ]) {
    assert.match(shell + workspace + systemStatus + css, new RegExp(marker));
  }
});

test("terminal live empty states do not imply mock whale data", async () => {
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");

  assert.doesNotMatch(workspace, /Demo fallback supplies mock whale rows/);
  assert.match(workspace, /No public wallet flow available for this live market yet/);
  assert.match(workspace, /Demo fallback is active; mock wallet rows remain labeled as demo data/);
  assert.match(workspace, /<WhaleTrackerPanel wallets=\{walletActivity\} dataMode=\{dataMode\} \/>/);
});

test("terminal source empty states keep live and fallback copy separate", async () => {
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");

  assert.doesNotMatch(
    workspace,
    /No normalized sources loaded for this market yet\. Live unavailable, demo data shown when fallback mode is active\./,
  );
  assert.match(workspace, /No normalized sources available for this live market yet\./);
  assert.match(workspace, /Demo fallback is active; normalized source rows remain labeled as demo data\./);
  assert.match(workspace, /sourceEmptyStateCopy/);
  assert.match(workspace, /<SourceLibraryPanel[\s\S]*dataMode=\{dataMode\}/);
});

test("terminal does not default unknown data mode to live", async () => {
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");
  const systemStatus = await readFile("src/components/terminal/SystemStatusPanel.tsx", "utf8");

  assert.doesNotMatch(workspace + systemStatus, /dataMode \?\? "real"/);
  assert.doesNotMatch(workspace + systemStatus, /status\?\.mode \?\? "real"/);
  assert.doesNotMatch(workspace, /dataMode === "mock" \? "demo" : "live"/);
  assert.doesNotMatch(workspace, /dataMode === "mock" \? "demo fallback" : "live"/);
  assert.doesNotMatch(workspace, /dataMode === "mock" \? "mock fallback" : "live public data"/);
  assert.doesNotMatch(workspace, /dataMode === "mock" \? "demo fallback" : "live reads"/);
  assert.match(workspace + systemStatus, /Checking public data mode/);
  assert.match(workspace + systemStatus, /checking data mode/);
  assert.match(workspace, /dataModeLabel/);
  assert.match(systemStatus, /status\?\.mode \?\? "checking"/);
});

test("terminal market discovery exposes full Polymarket browse and search parameters", async () => {
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");
  const hook = await readFile("src/hooks/useTerminalDiscovery.ts", "utf8");
  const defaults = await readFile("src/hooks/discovery-url.ts", "utf8");
  const discovery = await readFile("src/lib/polymarket/discovery.ts", "utf8");
  const api = await readFile("src/app/api/discovery/route.ts", "utf8");

  assert.match(discovery, /all_markets/);
  assert.match(workspace, /Every public market, immediately scannable/);
  assert.match(hook, /offset/);
  assert.match(hook, /query/);
  assert.match(defaults, /DISCOVERY_DEFAULT_LIMIT = 80/);
  assert.match(api, /laneRaw = url\.searchParams\.get\("lane"\) \?\? "all_markets"/);
  assert.match(api, /searchParams\.get\("q"\)/);
  assert.match(api, /searchParams\.get\("offset"\)/);
});

test("terminal product shell avoids fixed desktop width that clips the app browser", async () => {
  const css = await readFile("src/app/globals.css", "utf8");
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");

  assert.doesNotMatch(css, /min-width:\s*1360px/);
  assert.doesNotMatch(css, /grid-template-columns:\s*330px minmax\(460px/);
  assert.doesNotMatch(workspace, /terminal-left-sidebar/);
  assert.match(css, /\.terminal-market-screen \.editorial-page-canvas \.terminal-workspace-panel\s*\{[\s\S]*width:\s*100%/);
  assert.match(css, /\.terminal-market-first-grid \.terminal-screener-row\s*\{[\s\S]*min-width:\s*900px/);
});
