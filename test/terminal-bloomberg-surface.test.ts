import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  TERMINAL_ROUTES,
  terminalRouteById,
  terminalSectionFromPath,
} from "../src/lib/terminal/routes.ts";

test("terminal route registry exposes the routed market-first read-only screens", () => {
  assert.deepEqual(
    TERMINAL_ROUTES.map((route) => route.id),
    [
      "markets",
      "trending",
      "market-detail",
      "movers",
      "deadlines",
      "sources",
      "alerts",
      "watchlist",
      "status",
    ],
  );

  assert.equal(TERMINAL_ROUTES.every((route) => route.product === "polymarket"), true);
  assert.equal(TERMINAL_ROUTES.every((route) => route.readOnly), true);
  assert.equal(terminalSectionFromPath("/terminal")?.id, "markets");
  assert.equal(terminalSectionFromPath("/terminal/market/540816")?.id, "market-detail");
  assert.equal(terminalRouteById("order-book")?.readOnly, true);
});

test("terminal compatibility entrypoints delegate to the product shell", async () => {
  const shell = await readFile("src/components/terminal/TerminalShell.tsx", "utf8");
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");
  const runtime = await readFile("src/components/terminal/MarketTerminalRuntime.tsx", "utf8");
  const provider = await readFile("src/components/terminal/terminal-context.tsx", "utf8");
  const wrappers = await Promise.all([
    readFile("src/components/terminal/TerminalBloomberg.tsx", "utf8"),
    readFile("src/components/terminal/BloombergTerminalRuntime.tsx", "utf8"),
    readFile("src/components/terminal/TerminalBWRuntime.tsx", "utf8"),
    readFile("src/components/terminal/PolymarketTerminal.tsx", "utf8"),
    readFile("src/components/terminal/MarketFirstTerminalShell.tsx", "utf8"),
  ]);
  const routes = await readFile("src/lib/terminal/routes.ts", "utf8");
  const css = await readFile("src/app/globals.css", "utf8");
  const wrapperSource = wrappers.join("\n");

  assert.doesNotMatch(shell, /trade execution|order placement|withdraw|custody/i);
  assert.match(shell, /export function TerminalShell/);
  assert.match(provider, /<TerminalContext\.Provider value=\{value\}>\s*\{children\}\s*<\/TerminalContext\.Provider>/);
  assert.doesNotMatch(provider, /InstitutionalPolymarketTerminal/);
  assert.doesNotMatch(workspace, /import \{ InstitutionalPolymarketTerminal \}/);
  assert.doesNotMatch(workspace, /NEXT_PUBLIC_SOLVOL_LEGACY_TERMINAL/);
  assert.doesNotMatch(workspace, /return <InstitutionalPolymarketTerminal/);
  assert.doesNotMatch(workspace, /function LegacySignalFlowWorkspace/);
  assert.match(runtime, /return <TerminalShell \/>/);
  assert.equal(wrappers.every((source) => /return <TerminalShell \/>/.test(source)), true);
  assert.doesNotMatch(wrapperSource, /terminal-bloomberg-shell|POLYMARKET_TERMINAL_ROUTES/);
  assert.doesNotMatch(css, /terminal-bloomberg-shell|:has\(\.terminal-bloomberg-shell\)|--term-/);

  for (const marker of [
    "terminal-market-app-shell",
    "terminal-primary-sidebar",
    "live-desk-beta-bar",
    "SignalFlowWorkspace",
    "SidebarNav",
    "TERMINAL_ROUTES",
    "All Markets",
    "Market Detail",
    "Sources",
    "Alerts",
    "Watchlist",
    "Data Sources",
  ]) {
    assert.match(
      shell + workspace + runtime + provider + wrapperSource + routes + css,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }

  assert.match(css, /\.terminal-market-app-shell\s*\{[\s\S]*grid-template-columns:\s*258px minmax\(0,\s*1fr\)/);
  assert.match(css, /--terminal-bg:\s*#050505/);
  assert.match(css, /--terminal-text:\s*#f2f2f2/);
});
