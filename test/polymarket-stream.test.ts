import test from "node:test";
import assert from "node:assert/strict";
import {
  POLYMARKET_PUBLIC_WEBSOCKET_CHANNELS,
  buildPolymarketMarketSubscription,
  createPolymarketMarketStreamConsumer,
  normalizePolymarketMarketStreamMessage,
} from "../src/lib/terminal/polymarket-stream.ts";

const ASSETS = [
  {
    assetId: "21742633143463906290569050155826241533067272736897614950488156847949938836455",
    marketId: "540816",
    conditionId: "0xabc",
    outcome: "YES" as const,
  },
  {
    assetId: "48331043336612883890938759509493159234755048973500640148014422747788308965732",
    marketId: "540816",
    conditionId: "0xabc",
    outcome: "NO" as const,
  },
];

test("Polymarket public websocket manifest only exposes unauthenticated market reads", () => {
  assert.deepEqual(POLYMARKET_PUBLIC_WEBSOCKET_CHANNELS, [
    {
      id: "market",
      endpoint: "wss://ws-subscriptions-clob.polymarket.com/ws/market",
      readOnly: true,
      requiresAuth: false,
      subscriptionType: "market",
      heartbeat: "client-ping",
    },
  ]);

  const subscription = buildPolymarketMarketSubscription(ASSETS);
  assert.deepEqual(subscription, {
    assets_ids: ASSETS.map((asset) => asset.assetId),
    type: "market",
    custom_feature_enabled: true,
  });
  assert.equal("auth" in subscription, false);
  assert.equal("markets" in subscription, false);
});

test("Polymarket market websocket messages normalize to deterministic checkpoints and price records", () => {
  const result = normalizePolymarketMarketStreamMessage(
    {
      event_type: "best_bid_ask",
      asset_id: ASSETS[0]!.assetId,
      market: "0xabc",
      best_bid: "0.73",
      best_ask: "0.77",
      spread: "0.04",
      timestamp: "1766789469958",
    },
    ASSETS,
    { sequence: 12, observedAt: "2026-05-07T12:00:00.000Z" },
  );

  assert.equal(result?.checkpoint.sourceId, "polymarket-public");
  assert.equal(result?.checkpoint.channel, "market");
  assert.equal(result?.checkpoint.marketId, "540816");
  assert.equal(result?.checkpoint.assetId, ASSETS[0]!.assetId);
  assert.equal(result?.checkpoint.eventType, "best_bid_ask");
  assert.equal(result?.checkpoint.cursor.after, "1766789469958:21742633143463906290569050155826241533067272736897614950488156847949938836455:best_bid_ask:12");
  assert.deepEqual(result?.priceRecord, {
    marketId: "540816",
    ts: "2025-12-26T22:51:09.958Z",
    priceYes: 0.75,
    priceNo: 0.25,
    source: "polymarket-public",
  });
});

test("Polymarket market websocket consumer subscribes read-only, heartbeats, and emits checkpoints", () => {
  const sent: string[] = [];
  const received: string[] = [];
  const consumer = createPolymarketMarketStreamConsumer({
    assets: ASSETS,
    send: (payload) => sent.push(payload),
    onMessage: (message) => received.push(message.checkpoint.cursor.after),
    now: () => "2026-05-07T12:00:00.000Z",
  });

  consumer.open();
  consumer.heartbeat();
  consumer.receive(JSON.stringify({
    event_type: "last_trade_price",
    asset_id: ASSETS[1]!.assetId,
    market: "0xabc",
    price: "0.38",
    size: "400",
    timestamp: "1766789470000",
  }));

  assert.equal(JSON.parse(sent[0] ?? "{}").type, "market");
  assert.equal(JSON.parse(sent[0] ?? "{}").auth, undefined);
  assert.equal(sent[1], "PING");
  assert.deepEqual(received, [
    "1766789470000:48331043336612883890938759509493159234755048973500640148014422747788308965732:last_trade_price:1",
  ]);
});
