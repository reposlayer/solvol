import type { PriceHistoryPoint } from "./types";

export type BookSide = "BID" | "ASK";

export type OrderBookLevel = {
  price: number;
  size: number;
};

export type NormalizedOrderBook = {
  market: string;
  assetId: string;
  timestamp: string | null;
  timestampSec: number | null;
  hash: string | null;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  minOrderSize: number | null;
  tickSize: number | null;
  negRisk: boolean | null;
  lastTradePrice: number | null;
};

export type DepthLadderRow = {
  side: BookSide;
  price: number;
  size: number;
  notional: number;
  cumulativeSize: number;
  cumulativeNotional: number;
  distanceFromMid: number | null;
};

export type OrderBookSummary = {
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  mid: number | null;
  bidDepth: number;
  askDepth: number;
  bidNotional: number;
  askNotional: number;
  topImbalance: number | null;
  depthImbalance: number | null;
  lastTradePrice: number | null;
  tickSize: number | null;
  minOrderSize: number | null;
  timestamp: string | null;
  ladder: DepthLadderRow[];
};

export type JumpPoint = {
  t: number;
  windowStart: number;
  windowEnd: number;
  priceBefore: number;
  priceAfter: number;
  movePercent: number;
  moveCents: number;
  direction: "YES" | "NO";
};

export type PublicMarketTrade = {
  proxyWallet: string | null;
  side: "BUY" | "SELL";
  asset: string | null;
  conditionId: string | null;
  size: number;
  price: number;
  timestamp: number;
  title: string | null;
  slug: string | null;
  eventSlug: string | null;
  outcome: string | null;
  outcomeIndex: number | null;
  traderName: string | null;
  transactionHash: string | null;
  notional: number;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function finiteNumber(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function round(n: number, digits = 6): number {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

function normalizeLevels(raw: unknown, side: BookSide): OrderBookLevel[] {
  if (!Array.isArray(raw)) return [];
  const levels = raw
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const price = finiteNumber(row.price);
      const size = finiteNumber(row.size);
      if (price == null || size == null || price < 0 || size < 0) return null;
      return { price, size };
    })
    .filter((level): level is OrderBookLevel => level !== null);

  return levels.sort((a, b) => (side === "BID" ? b.price - a.price : a.price - b.price));
}

export function normalizeOrderBook(raw: unknown): NormalizedOrderBook | null {
  const data = asRecord(raw);
  if (!data) return null;

  const market = stringOrNull(data.market);
  const assetId = stringOrNull(data.asset_id) ?? stringOrNull(data.assetId);
  if (!market || !assetId) return null;

  const timestamp = stringOrNull(data.timestamp);
  const timestampSec = finiteNumber(data.timestamp);

  return {
    market,
    assetId,
    timestamp,
    timestampSec,
    hash: stringOrNull(data.hash),
    bids: normalizeLevels(data.bids, "BID"),
    asks: normalizeLevels(data.asks, "ASK"),
    minOrderSize: finiteNumber(data.min_order_size),
    tickSize: finiteNumber(data.tick_size),
    negRisk: typeof data.neg_risk === "boolean" ? data.neg_risk : null,
    lastTradePrice: finiteNumber(data.last_trade_price),
  };
}

function sumDepth(levels: OrderBookLevel[]): { size: number; notional: number } {
  return levels.reduce(
    (acc, level) => ({
      size: acc.size + level.size,
      notional: acc.notional + level.size * level.price,
    }),
    { size: 0, notional: 0 },
  );
}

function imbalance(left: number, right: number): number | null {
  const den = left + right;
  return den > 0 ? (left - right) / den : null;
}

function ladderRows(
  levels: OrderBookLevel[],
  side: BookSide,
  mid: number | null,
): DepthLadderRow[] {
  let cumulativeSize = 0;
  let cumulativeNotional = 0;
  return levels.map((level) => {
    const notional = level.price * level.size;
    cumulativeSize += level.size;
    cumulativeNotional += notional;
    return {
      side,
      price: level.price,
      size: level.size,
      notional,
      cumulativeSize,
      cumulativeNotional,
      distanceFromMid: mid == null ? null : round((level.price - mid) * 100, 3),
    };
  });
}

export function summarizeOrderBook(
  book: NormalizedOrderBook,
  maxLevels = 8,
): OrderBookSummary {
  const bids = book.bids.slice(0, Math.max(1, maxLevels));
  const asks = book.asks.slice(0, Math.max(1, maxLevels));
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread = bestBid != null && bestAsk != null ? round(bestAsk - bestBid) : null;
  const mid = bestBid != null && bestAsk != null ? round((bestBid + bestAsk) / 2) : null;
  const bid = sumDepth(bids);
  const ask = sumDepth(asks);
  const topBidSize = bids[0]?.size ?? 0;
  const topAskSize = asks[0]?.size ?? 0;

  return {
    bestBid,
    bestAsk,
    spread,
    mid,
    bidDepth: bid.size,
    askDepth: ask.size,
    bidNotional: bid.notional,
    askNotional: ask.notional,
    topImbalance: imbalance(topBidSize, topAskSize),
    depthImbalance: imbalance(bid.size, ask.size),
    lastTradePrice: book.lastTradePrice,
    tickSize: book.tickSize,
    minOrderSize: book.minOrderSize,
    timestamp: book.timestamp,
    ladder: [...ladderRows(asks.slice().reverse(), "ASK", mid), ...ladderRows(bids, "BID", mid)],
  };
}

export function detectLargestJumpPoint(
  history: PriceHistoryPoint[],
  opts?: { minMoveCents?: number },
): JumpPoint | null {
  if (history.length < 2) return null;
  const minMoveCents = opts?.minMoveCents ?? 0.25;

  let bestIndex = -1;
  let bestAbsCents = -1;

  for (let i = 1; i < history.length; i++) {
    const before = history[i - 1]!;
    const after = history[i]!;
    const absCents = Math.abs((after.p - before.p) * 100);
    if (absCents > bestAbsCents) {
      bestAbsCents = absCents;
      bestIndex = i;
    }
  }

  if (bestIndex < 1 || bestAbsCents < minMoveCents) return null;

  const before = history[bestIndex - 1]!;
  const after = history[bestIndex]!;
  const movePercent = before.p > 0 ? ((after.p - before.p) / before.p) * 100 : 0;

  return {
    t: after.t,
    windowStart: before.t,
    windowEnd: after.t,
    priceBefore: before.p,
    priceAfter: after.p,
    movePercent,
    moveCents: round((after.p - before.p) * 100, 3),
    direction: after.p >= before.p ? "YES" : "NO",
  };
}

export function normalizeDataApiTrades(raw: unknown): PublicMarketTrade[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const side = row.side === "BUY" || row.side === "SELL" ? row.side : null;
      const size = finiteNumber(row.size);
      const price = finiteNumber(row.price);
      const timestamp = finiteNumber(row.timestamp);
      if (!side || size == null || price == null || timestamp == null) return null;
      return {
        proxyWallet: stringOrNull(row.proxyWallet),
        side,
        asset: stringOrNull(row.asset),
        conditionId: stringOrNull(row.conditionId),
        size,
        price,
        timestamp,
        title: stringOrNull(row.title),
        slug: stringOrNull(row.slug),
        eventSlug: stringOrNull(row.eventSlug),
        outcome: stringOrNull(row.outcome),
        outcomeIndex: finiteNumber(row.outcomeIndex),
        traderName: stringOrNull(row.name) ?? stringOrNull(row.pseudonym),
        transactionHash: stringOrNull(row.transactionHash),
        notional: price * size,
      };
    })
    .filter((trade): trade is PublicMarketTrade => trade !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function deriveNewsTerms(question: string, description?: string | null): string[] {
  const text = `${question} ${description ?? ""}`;
  const acronyms = text.match(/\b[A-Z]{2,6}\b/g) ?? [];
  const money = text.match(/\$[\d,.]+[kKmMbB]?/g) ?? [];
  const years = text.match(/\b20\d{2}\b/g) ?? [];
  const words = question
    .replace(/[^\p{L}\p{N}\s$-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !/^(will|market|after|before|above|below|this|that|with|from|have)$/i.test(word));

  return Array.from(new Set([...acronyms, ...money, ...years, ...words])).slice(0, 18);
}
