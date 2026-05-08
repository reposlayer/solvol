import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAlertRules } from "../src/lib/terminal/alerts.ts";
import { mergeTerminalTimeline } from "../src/lib/terminal/timeline.ts";
import type {
  AlertRule,
  EventItem,
  Market,
  MarketMove,
  MoveCorrelation,
  WalletActivity,
} from "../src/lib/terminal/types.ts";

const NOW = "2026-05-07T10:05:00.000Z";

test("evaluateAlertRules deterministically emits local alerts for every terminal rule kind", () => {
  const market = marketFixture();
  const move: MarketMove = {
    id: "move-m1",
    marketId: "m1",
    timestamp: "2026-05-07T10:00:00.000Z",
    windowMinutes: 30,
    probabilityBefore: 0.49,
    probabilityAfter: 0.64,
    volumeUsd: 310_000,
    source: "polymarket",
  };
  const whale: WalletActivity = {
    id: "wallet-m1",
    marketId: "m1",
    walletAddress: "0x1111111111111111111111111111111111111111",
    label: "Public whale",
    outcome: "YES",
    side: "BUY",
    size: 34_000,
    notionalUsd: 185_000,
    price: 0.62,
    timestamp: "2026-05-07T10:02:00.000Z",
    source: "polymarket",
  };
  const rules: AlertRule[] = [
    rule("cross", "probability_cross", 0.6, null),
    rule("jump", "probability_jump", 0.1, 30),
    rule("volume", "volume_spike", 3, 60),
    rule("whale", "whale_activity", 100_000, 15),
    rule("watch", "watched_market", 1, null),
  ];

  const events = evaluateAlertRules({
    rules,
    markets: [market],
    moves: [move],
    walletActivity: [whale],
    watchedMarketIds: ["m1"],
    now: NOW,
  });

  assert.deepEqual(events.map((event) => event.ruleId), ["cross", "jump", "volume", "whale", "watch"]);
  assert.ok(events.every((event) => event.marketId === "m1"));
  assert.ok(events.every((event) => event.id.startsWith("local-alert:")));
  assert.equal(events.find((event) => event.ruleId === "whale")?.severity, "critical");
  assert.match(events.find((event) => event.ruleId === "volume")?.body ?? "", /4\.0x baseline/);
});

test("mergeTerminalTimeline normalizes events, moves, wallets, and correlations in reverse time order", () => {
  const move: MarketMove = {
    id: "move-m1",
    marketId: "m1",
    timestamp: "2026-05-07T10:00:00.000Z",
    windowMinutes: 30,
    probabilityBefore: 0.49,
    probabilityAfter: 0.64,
    volumeUsd: 310_000,
    source: "polymarket",
  };
  const wallet: WalletActivity = {
    id: "wallet-m1",
    marketId: "m1",
    walletAddress: "0x1111111111111111111111111111111111111111",
    label: "Public whale",
    outcome: "YES",
    side: "BUY",
    size: 34_000,
    notionalUsd: 185_000,
    price: 0.62,
    timestamp: "2026-05-07T10:03:00.000Z",
    source: "polymarket",
  };
  const event: EventItem = {
    id: "event-m1",
    marketId: "m1",
    timestamp: "2026-05-07T09:55:00.000Z",
    kind: "news",
    title: "Official statement changed the expected timeline",
    summary: "A source item used for deterministic timeline merging.",
    source: {
      id: "rss",
      label: "RSS",
      kind: "external",
      url: "https://example.com/source",
    },
    impact: "up",
    importance: 82,
  };
  const correlation: MoveCorrelation = {
    moveId: "move-m1",
    direction: "up",
    score: 88,
    summary: "Two deterministic matches around an up move.",
    matches: [
      {
        itemId: "event-m1",
        kind: "event",
        title: event.title,
        timestamp: event.timestamp,
        score: 84,
        reason: "5m from move, up impact, RSS",
      },
      {
        itemId: "wallet-m1",
        kind: "wallet",
        title: "Public whale BUY YES",
        timestamp: wallet.timestamp,
        score: 91,
        reason: "3m from move, YES BUY, high conviction",
      },
    ],
  };

  const rows = mergeTerminalTimeline({
    events: [event],
    moves: [move],
    walletActivity: [wallet],
    correlations: [correlation],
  });

  assert.deepEqual(rows.map((row) => row.kind), ["wallet", "market_move", "news"]);
  assert.equal(rows[0]?.correlationScore, 91);
  assert.equal(rows[1]?.correlationScore, 88);
  assert.equal(rows[2]?.correlationScore, 84);
  assert.match(rows[1]?.summary ?? "", /49\.0c to 64\.0c/);
});

function rule(
  id: string,
  kind: AlertRule["kind"],
  threshold: number,
  windowMinutes: number | null,
): AlertRule {
  return {
    id,
    marketId: null,
    name: `Rule ${id}`,
    kind,
    threshold,
    windowMinutes,
    enabled: true,
    createdAt: "2026-05-07T09:00:00.000Z",
  };
}

function marketFixture(): Market {
  return {
    id: "m1",
    source: { id: "polymarket", label: "Polymarket", kind: "polymarket" },
    title: "Will the test market cross 60%?",
    category: "Test",
    event: "Test event",
    url: "https://polymarket.com/event/test",
    description: "Fixture market",
    resolutionRules: "Fixture rules",
    outcomes: [
      { id: "m1-yes", label: "YES", probability: 0.64, price: 0.64 },
      { id: "m1-no", label: "NO", probability: 0.36, price: 0.36 },
    ],
    probability: 0.64,
    volume24h: 800_000,
    volume7d: 1_400_000,
    liquidity: 1_000_000,
    openInterest: 1_250_000,
    closeTime: "2026-06-01T00:00:00.000Z",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: NOW,
    status: "open",
    priceHistory: [
      { timestamp: "2026-05-07T09:00:00.000Z", probability: 0.49, volumeUsd: 90_000 },
      { timestamp: "2026-05-07T09:30:00.000Z", probability: 0.58, volumeUsd: 170_000 },
      { timestamp: "2026-05-07T10:00:00.000Z", probability: 0.64, volumeUsd: 310_000 },
    ],
  };
}
