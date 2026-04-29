import test from "node:test";
import assert from "node:assert/strict";
import {
  detectLargestJumpPoint,
  normalizeDataApiTrades,
  normalizeOrderBook,
  summarizeOrderBook,
} from "../src/lib/polymarket/market-intel";

test("summarizeOrderBook reads best bid, ask, spread and top-level imbalance", () => {
  const book = normalizeOrderBook({
    market: "0xmarket",
    asset_id: "yes-token",
    timestamp: "1710000000",
    hash: "abc",
    bids: [
      { price: "0.43", size: "250" },
      { price: "0.44", size: "100" },
    ],
    asks: [
      { price: "0.47", size: "80" },
      { price: "0.46", size: "120" },
    ],
    min_order_size: "1",
    tick_size: "0.01",
    neg_risk: false,
    last_trade_price: "0.45",
  });

  assert.ok(book);
  const summary = summarizeOrderBook(book, 2);

  assert.equal(summary.bestBid, 0.44);
  assert.equal(summary.bestAsk, 0.46);
  assert.equal(summary.spread, 0.02);
  assert.equal(summary.mid, 0.45);
  assert.equal(summary.bidDepth, 350);
  assert.equal(summary.askDepth, 200);
  assert.equal(summary.topImbalance, (100 - 120) / (100 + 120));
  assert.equal(summary.ladder[0]?.side, "ASK");
  assert.equal(summary.ladder.at(-1)?.side, "BID");
});

test("detectLargestJumpPoint returns the largest consecutive YES repricing", () => {
  const marker = detectLargestJumpPoint([
    { t: 100, p: 0.41 },
    { t: 200, p: 0.43 },
    { t: 300, p: 0.58 },
    { t: 400, p: 0.54 },
  ]);

  assert.deepEqual(marker, {
    t: 300,
    windowStart: 200,
    windowEnd: 300,
    priceBefore: 0.43,
    priceAfter: 0.58,
    movePercent: ((0.58 - 0.43) / 0.43) * 100,
    moveCents: 15,
    direction: "YES",
  });
});

test("normalizeDataApiTrades filters malformed trades and orders newest first", () => {
  const trades = normalizeDataApiTrades([
    { side: "BUY", asset: "yes", conditionId: "0x1", size: 12, price: 0.52, timestamp: 20, outcome: "Yes" },
    { side: "SELL", asset: "yes", conditionId: "0x1", size: "bad", price: 0.51, timestamp: 25, outcome: "Yes" },
    { side: "SELL", asset: "no", conditionId: "0x1", size: 3, price: 0.47, timestamp: 30, outcome: "No" },
  ]);

  assert.equal(trades.length, 2);
  assert.equal(trades[0]?.timestamp, 30);
  assert.equal(trades[1]?.timestamp, 20);
});
