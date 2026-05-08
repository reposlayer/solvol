import test from "node:test";
import assert from "node:assert/strict";
import {
  MARKET_TABLE_SAVED_VIEWS,
  buildAutopilotActions,
  buildCommandSuggestions,
  buildDecisionJournal,
  buildEvidenceConfidence,
  buildLocalAlertRuleFromDraft,
  buildMarketReplayFrames,
  buildOpportunityHeatmap,
  buildWhyMovedBadge,
  buildRelatedMarketGraph,
  buildSmartAlertDraft,
  buildTradeTapeSignals,
  buildWarRoomChecklist,
} from "../src/components/terminal/terminal-turbo.ts";

const market = {
  id: "2078312",
  title: "Lakers vs. Rockets",
  yes: 0.64,
  no: 0.36,
  movePct: 14.2,
  spread: 0.02,
  liquidity: 1_200_000,
  volume24h: 850_000,
  sourceCount: 5,
  hasCatalyst: false,
  topCatalystTitle: null,
};

const rows = [
  {
    id: "a",
    question: "Lakers vs. Rockets",
    terminalScore: 92,
    volume24hr: 250_000,
    liquidityNum: 800_000,
    shortMovePct: 18,
    yesPrice: 0.64,
    hoursToClose: 12,
    sourceDensity: 5,
  },
  {
    id: "b",
    question: "Bitcoin over 100k",
    terminalScore: 71,
    volume24hr: 400_000,
    liquidityNum: 600_000,
    shortMovePct: -9,
    yesPrice: 0.38,
    hoursToClose: 60,
    sourceDensity: 1,
  },
];

const sources = [
  {
    provider: "gdelt",
    title: "Team injury report moves market",
    category: "event_graph",
    reliability: 0.82,
    origin: "fresh",
    publishedAt: new Date().toISOString(),
  },
  {
    provider: "rss",
    title: "Preview mentions rotation",
    category: "news",
    reliability: 0.48,
    origin: "stored",
    publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  },
];

const trades = [
  { price: 0.64, size: 9000, side: "BUY", timestamp: new Date().toISOString() },
  { price: 0.63, size: 7400, side: "BUY", timestamp: new Date().toISOString() },
  { price: 0.60, size: 500, side: "SELL", timestamp: new Date().toISOString() },
];

test("autopilot prioritizes analyze when catalyst is missing on a moving market", () => {
  const actions = buildAutopilotActions(market);

  assert.equal(actions[0]?.id, "analyze");
  assert.match(actions[0]?.reason ?? "", /move/i);
  assert.ok(actions.some((action) => action.id === "pin"));
});

test("war room checklist covers price, book, trades, sources and decision", () => {
  const checklist = buildWarRoomChecklist({ market, sourceCount: 5, tradeCount: 3, hasBook: true });

  assert.deepEqual(
    checklist.map((item) => item.id),
    ["price", "book", "tape", "sources", "decision"],
  );
  assert.ok(checklist.every((item) => typeof item.ready === "boolean"));
});

test("replay frames sample price path and attach source events", () => {
  const frames = buildMarketReplayFrames(
    [
      { t: 100, p: 0.4 },
      { t: 200, p: 0.5 },
      { t: 300, p: 0.64 },
    ],
    sources,
  );

  assert.equal(frames.length, 3);
  assert.equal(frames.at(-1)?.price, 0.64);
  assert.ok(frames.some((frame) => frame.events.length > 0));
});

test("smart alert draft combines movement, confidence and liquidity constraints", () => {
  const draft = buildSmartAlertDraft(market, 76);

  assert.equal(draft.enabled, true);
  assert.ok(draft.rules.some((rule) => rule.metric === "move"));
  assert.ok(draft.rules.some((rule) => rule.metric === "confidence"));
  assert.ok(draft.summary.includes("14.2"));
});

test("evidence confidence ranks fresh reliable sources higher", () => {
  const confidence = buildEvidenceConfidence(sources);

  assert.equal(confidence[0]?.title, "Team injury report moves market");
  assert.ok((confidence[0]?.score ?? 0) > (confidence[1]?.score ?? 0));
});

test("related graph creates nodes and weighted links from related markets", () => {
  const graph = buildRelatedMarketGraph("2078312", [
    { marketId: "x", title: "NBA playoff related", movePercent: 8, directionAligned: true, yesPrice: 0.52 },
    { marketId: "y", title: "Diverged market", movePercent: -4, directionAligned: false, yesPrice: 0.41 },
  ]);

  assert.equal(graph.nodes[0]?.id, "2078312");
  assert.equal(graph.links.length, 2);
  assert.equal(graph.links[0]?.tone, "aligned");
});

test("trade tape signals detect whale pressure and buy imbalance", () => {
  const signals = buildTradeTapeSignals(trades);

  assert.ok(signals.some((signal) => signal.id === "whale-print"));
  assert.ok(signals.some((signal) => signal.id === "buy-pressure"));
});

test("decision journal seeds a reusable decision record", () => {
  const journal = buildDecisionJournal(market, "Strong correlation");

  assert.equal(journal.marketId, "2078312");
  assert.ok(journal.tags.includes("turbo"));
  assert.match(journal.thesis, /Strong correlation/);
});

test("opportunity heatmap groups lanes by intensity", () => {
  const heatmap = buildOpportunityHeatmap(rows);

  assert.equal(heatmap[0]?.id, "momentum");
  assert.ok((heatmap[0]?.intensity ?? 0) >= (heatmap.at(-1)?.intensity ?? 0));
});

test("command suggestions expose power console actions for focused market", () => {
  const suggestions = buildCommandSuggestions("2078312", "Lakers");

  assert.ok(suggestions.some((item) => item.command === "replay 2078312"));
  assert.ok(suggestions.some((item) => item.command === "alert 2078312"));
  assert.ok(suggestions.some((item) => item.command === "go sources"));
  assert.ok(suggestions.some((item) => item.command === "show movers"));
  assert.ok(suggestions.some((item) => item.command === "search crypto"));
  assert.ok(suggestions.some((item) => item.command === "open market 2078312"));
  assert.ok(suggestions.every((item) => item.label.length > 0));
});

test("why-moved badges classify table rows into intelligence states", () => {
  assert.equal(
    buildWhyMovedBadge({ ...rows[0], sourceDensity: 4 }, { hasOfficialSource: true }).label,
    "Official source",
  );
  assert.equal(
    buildWhyMovedBadge({ ...rows[0], sourceDensity: 2 }, { hasOfficialSource: false }).label,
    "Move explained",
  );
  assert.equal(
    buildWhyMovedBadge({ ...rows[1], sourceDensity: 0 }, { hasOfficialSource: false }).label,
    "Needs source",
  );
  assert.equal(
    buildWhyMovedBadge({ ...rows[1], terminalScore: 22, sourceDensity: 1 }, { hasOfficialSource: false }).label,
    "Low confidence",
  );
});

test("market table saved views cover operator presets and URL-share params", () => {
  assert.deepEqual(
    MARKET_TABLE_SAVED_VIEWS.map((view) => view.id),
    ["high-volume", "closing-24h", "crypto", "watchlist-movers"],
  );
  assert.ok(MARKET_TABLE_SAVED_VIEWS.every((view) => view.shareParams.view === view.id));
  assert.ok(MARKET_TABLE_SAVED_VIEWS.some((view) => view.label === "Watchlist + Movers"));
});

test("alert draft can become a local read-only rule with one action", () => {
  const draft = buildSmartAlertDraft(market, 76);
  const rule = buildLocalAlertRuleFromDraft({
    marketId: market.id,
    marketTitle: market.title,
    draft,
    now: "2026-05-07T10:00:00.000Z",
  });

  assert.equal(rule.marketId, market.id);
  assert.equal(rule.kind, "probability_jump");
  assert.equal(rule.enabled, true);
  assert.match(rule.id, /^local-draft-/);
  assert.match(rule.name, /Suggested alert from this market move/);
});
