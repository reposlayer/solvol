import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { TERMINAL_ROUTES, terminalSectionFromPath } from "../src/lib/terminal/routes.ts";

test("required Solvol foundation documents exist and describe read-only Polymarket scope", async () => {
  for (const path of [
    "SOLVOL_PROTOCOL.md",
    "SOLVOL_PLAN.md",
    "ARCHITECTURE.md",
    "DATA_CONTRACTS.md",
    "README.md",
    "AGENTS.md",
  ]) {
    await stat(path);
  }

  const protocol = await readFile("SOLVOL_PROTOCOL.md", "utf8");
  assert.match(protocol, /Polymarket only/i);
  assert.match(protocol, /read-only/i);
  assert.match(protocol, /No trade execution/i);

  const contracts = await readFile("DATA_CONTRACTS.md", "utf8");
  for (const name of [
    "MarketSource",
    "PolymarketAdapter",
    "MockPolymarketAdapter",
    "MarketMove",
    "WalletActivity",
    "AlertRule",
    "MoveCorrelation",
  ]) {
    assert.match(contracts, new RegExp(name));
  }

  const architecture = await readFile("ARCHITECTURE.md", "utf8");
  assert.match(architecture, /canary owner/i);
  assert.match(architecture, /canary reviewer/i);
  assert.match(architecture, /rollback approver/i);
});

test("terminal route registry covers every requested product module", () => {
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
  assert.equal(TERMINAL_ROUTES.find((route) => route.id === "markets")?.pathTemplate, "/terminal/markets");
  assert.equal(TERMINAL_ROUTES.find((route) => route.id === "market-detail")?.pathTemplate, "/terminal/market/[id]");
});

test("named Solvol terminal UI component artifacts are present for the foundation surface", async () => {
  for (const path of [
    "src/components/terminal/TerminalShell.tsx",
    "src/components/terminal/SidebarNav.tsx",
    "src/components/terminal/SignalFlowWorkspace.tsx",
    "src/components/terminal/TopCommandBar.tsx",
    "src/components/terminal/StatusStrip.tsx",
    "src/components/terminal/MarketTable.tsx",
    "src/components/terminal/PriceChart.tsx",
    "src/components/terminal/ProbabilityChart.tsx",
    "src/components/terminal/VolumeChart.tsx",
    "src/components/terminal/Timeline.tsx",
    "src/components/terminal/WhaleActivityTable.tsx",
    "src/components/terminal/AlertRuleForm.tsx",
    "src/components/terminal/SystemStatusPanel.tsx",
  ]) {
    await stat(path);
  }
});
