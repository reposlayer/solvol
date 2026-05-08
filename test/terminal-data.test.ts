import test from "node:test";
import assert from "node:assert/strict";
import { createMockMarketSource } from "../src/lib/terminal/mock-source.ts";
import {
  correlateMoveCauses,
  scoreMarketSignals,
  scoreMoveSignificance,
  scoreWhaleConviction,
} from "../src/lib/terminal/scoring.ts";
import type {
  EventItem,
  Market,
  MarketMove,
  WalletActivity,
} from "../src/lib/terminal/types.ts";

const NOW = "2026-05-07T10:00:00.000Z";

test("mock market source returns stable read-only terminal data", async () => {
  const source = createMockMarketSource({ now: NOW });
  const markets = await source.listMarkets({ limit: 4 });
  const detail = await source.getMarket(markets[0]!.id);
  const walletActivity = await source.listWalletActivity({ marketId: markets[0]!.id, limit: 8 });
  const events = await source.listEvents({ marketId: markets[0]!.id, limit: 8 });

  assert.equal(source.id, "demo");
  assert.equal(source.mode, "mock");
  assert.equal(source.readOnly, true);
  assert.equal(markets.length, 4);
  assert.equal(detail?.id, markets[0]!.id);
  assert.ok(markets.every((market) => market.source.id === "demo"));
  assert.ok(events.every((item) => item.source.kind === "mock"));
  assert.ok(events.every((item) => item.source.label.includes("Demo")));
  assert.ok(walletActivity.some((activity) => activity.walletAddress.startsWith("0x")));
});

test("scoreMarketSignals ranks a liquid moving market above a quiet market", () => {
  const moving = marketFixture({
    id: "moving",
    probability: 0.68,
    volume24h: 820_000,
    volume7d: 1_400_000,
    liquidity: 2_100_000,
    history: [
      { timestamp: "2026-05-07T08:00:00.000Z", probability: 0.52 },
      { timestamp: "2026-05-07T09:00:00.000Z", probability: 0.59 },
      { timestamp: "2026-05-07T10:00:00.000Z", probability: 0.68 },
    ],
  });
  const quiet = marketFixture({
    id: "quiet",
    probability: 0.51,
    volume24h: 9_500,
    volume7d: 110_000,
    liquidity: 30_000,
    history: [
      { timestamp: "2026-05-07T08:00:00.000Z", probability: 0.505 },
      { timestamp: "2026-05-07T09:00:00.000Z", probability: 0.51 },
      { timestamp: "2026-05-07T10:00:00.000Z", probability: 0.51 },
    ],
  });

  const movingScore = scoreMarketSignals(moving, {
    eventCount: 4,
    whaleCount: 3,
    now: NOW,
  });
  const quietScore = scoreMarketSignals(quiet, {
    eventCount: 0,
    whaleCount: 0,
    now: NOW,
  });

  assert.ok(movingScore.importanceScore > quietScore.importanceScore);
  assert.ok(movingScore.momentumScore > quietScore.momentumScore);
  assert.ok(movingScore.volatilityScore > quietScore.volatilityScore);
  assert.ok(movingScore.unusualVolumeScore > quietScore.unusualVolumeScore);
});

test("move and whale scores are bounded and interpretable", () => {
  const move: MarketMove = {
    id: "move-1",
    marketId: "m1",
    timestamp: "2026-05-07T10:00:00.000Z",
    windowMinutes: 30,
    probabilityBefore: 0.44,
    probabilityAfter: 0.58,
    volumeUsd: 260_000,
    source: "polymarket",
  };
  const whale: WalletActivity = {
    id: "wallet-1",
    marketId: "m1",
    walletAddress: "0x1111111111111111111111111111111111111111",
    label: "Public wallet",
    outcome: "YES",
    side: "BUY",
    size: 18_000,
    notionalUsd: 142_000,
    price: 0.57,
    timestamp: "2026-05-07T09:58:00.000Z",
    source: "polymarket",
  };

  assert.equal(scoreMoveSignificance(move), 100);
  assert.ok(scoreWhaleConviction(whale) >= 90);
});

test("correlateMoveCauses deterministically links nearby events and whale flow", () => {
  const move: MarketMove = {
    id: "move-2",
    marketId: "m2",
    timestamp: "2026-05-07T10:00:00.000Z",
    windowMinutes: 60,
    probabilityBefore: 0.62,
    probabilityAfter: 0.49,
    volumeUsd: 180_000,
    source: "polymarket",
  };
  const events: EventItem[] = [
    {
      id: "event-near",
      marketId: "m2",
      timestamp: "2026-05-07T09:48:00.000Z",
      kind: "news",
      title: "Demo: agency bulletin changes expected timeline",
      summary: "Demo/mock headline used for local fallback.",
      source: {
        id: "demo-news",
        label: "Demo news source",
        kind: "mock",
        url: null,
      },
      impact: "down",
      importance: 72,
    },
    {
      id: "event-far",
      marketId: "m2",
      timestamp: "2026-05-06T10:00:00.000Z",
      kind: "news",
      title: "Old headline",
      summary: "Outside the correlation window.",
      source: {
        id: "rss",
        label: "RSS",
        kind: "external",
        url: "https://example.com",
      },
      impact: "neutral",
      importance: 100,
    },
  ];
  const wallets: WalletActivity[] = [
    {
      id: "wallet-near",
      marketId: "m2",
      walletAddress: "0x2222222222222222222222222222222222222222",
      label: "Known wallet",
      outcome: "NO",
      side: "BUY",
      size: 30_000,
      notionalUsd: 210_000,
      price: 0.52,
      timestamp: "2026-05-07T10:04:00.000Z",
      source: "polymarket",
    },
  ];

  const result = correlateMoveCauses(move, events, wallets);

  assert.equal(result.moveId, "move-2");
  assert.equal(result.direction, "down");
  assert.equal(result.matches[0]?.itemId, "wallet-near");
  assert.equal(result.matches[1]?.itemId, "event-near");
  assert.ok(result.summary.includes("2 deterministic matches"));
  assert.ok(result.matches.every((match) => match.score >= 50));
});

function marketFixture(input: {
  id: string;
  probability: number;
  volume24h: number;
  volume7d: number;
  liquidity: number;
  history: Market["priceHistory"];
}): Market {
  return {
    id: input.id,
    source: { id: "test", label: "Test", kind: "mock" },
    title: `Market ${input.id}`,
    category: "Test",
    event: "Test event",
    url: null,
    description: "Fixture market",
    resolutionRules: "Resolves from fixture rules.",
    outcomes: [
      { id: `${input.id}-yes`, label: "YES", probability: input.probability, price: input.probability },
      { id: `${input.id}-no`, label: "NO", probability: 1 - input.probability, price: 1 - input.probability },
    ],
    probability: input.probability,
    volume24h: input.volume24h,
    volume7d: input.volume7d,
    liquidity: input.liquidity,
    openInterest: input.liquidity * 1.2,
    closeTime: "2026-06-01T00:00:00.000Z",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: NOW,
    status: "open",
    priceHistory: input.history,
  };
}
