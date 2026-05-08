import type { Market, MarketMove, MarketStatus } from "./types";
import { compileMarketQueryPack, type QueryEntity } from "./query-compiler.ts";

export type MarketRegistryRecord = {
  marketId: string;
  slug: string | null;
  eventSlug: string | null;
  question: string;
  category: string | null;
  entityRefs: QueryEntity[];
  resolutionSource: string | null;
  startDate: string | null;
  endDate: string | null;
  status: MarketStatus;
  liquidity: number;
  volume: number;
  url: string | null;
  updatedAt: string;
};

export type MarketPriceRecord = {
  marketId: string;
  ts: string;
  priceYes: number | null;
  priceNo: number | null;
  source: "polymarket-public";
  volume?: number;
};

export type MarketRegistryReconciliation = {
  registry: MarketRegistryRecord[];
  priceRecords: MarketPriceRecord[];
  reactionWindows: MarketMove[];
};

function slugFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? null;
  } catch {
    return null;
  }
}

function boundedProbability(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, Number(value.toFixed(6))));
}

function noPriceForMarket(market: Market, yes: number | null): number | null {
  const explicit = market.outcomes.find((outcome) => outcome.label.toUpperCase() === "NO")?.price;
  if (explicit != null && Number.isFinite(explicit)) return boundedProbability(explicit);
  return yes == null ? null : boundedProbability(1 - yes);
}

function windowMinutes(before: string, after: string): number {
  const start = Date.parse(before);
  const end = Date.parse(after);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 60_000));
}

export function marketToRegistryRecord(market: Market): MarketRegistryRecord {
  const queryPack = compileMarketQueryPack({
    marketId: market.id,
    question: market.title,
    description: [market.description, market.resolutionRules, market.event].filter(Boolean).join(" "),
    category: market.category,
  });
  const namedEntityRefs = queryPack.entities.filter((entity) => entity.kind !== "topic");

  return {
    marketId: market.id,
    slug: slugFromUrl(market.url),
    eventSlug: slugFromUrl(market.url),
    question: market.title,
    category: market.category || null,
    entityRefs: namedEntityRefs.length > 0 ? namedEntityRefs : queryPack.entities,
    resolutionSource: market.resolutionRules || null,
    startDate: market.createdAt,
    endDate: market.closeTime,
    status: market.status,
    liquidity: market.liquidity,
    volume: market.volume24h,
    url: market.url,
    updatedAt: market.updatedAt,
  };
}

export function marketToPriceRecords(market: Market): MarketPriceRecord[] {
  return market.priceHistory.map((point) => {
    const yes = boundedProbability(point.probability);
    return {
      marketId: market.id,
      ts: point.timestamp,
      priceYes: yes,
      priceNo: noPriceForMarket(market, yes),
      source: "polymarket-public",
      volume: point.volumeUsd,
    };
  });
}

export function detectPriceReactionWindows(
  market: Market,
  opts: { minAbsChange?: number } = {},
): MarketMove[] {
  const minAbsChange = opts.minAbsChange ?? 0.03;
  const windows: MarketMove[] = [];
  for (let i = 1; i < market.priceHistory.length; i++) {
    const before = market.priceHistory[i - 1]!;
    const after = market.priceHistory[i]!;
    const delta = after.probability - before.probability;
    if (Math.abs(delta) < minAbsChange) continue;
    windows.push({
      id: `polymarket-public-move-${market.id}-${after.timestamp}`,
      marketId: market.id,
      timestamp: after.timestamp,
      windowMinutes: windowMinutes(before.timestamp, after.timestamp),
      probabilityBefore: before.probability,
      probabilityAfter: after.probability,
      volumeUsd: after.volumeUsd ?? market.volume24h,
      source: "polymarket-public",
    });
  }
  return windows.sort((a, b) => Math.abs(b.probabilityAfter - b.probabilityBefore) - Math.abs(a.probabilityAfter - a.probabilityBefore));
}

export function reconcileMarketRegistry(markets: Market[]): MarketRegistryReconciliation {
  const byId = new Map<string, Market>();
  for (const market of markets) {
    const current = byId.get(market.id);
    if (!current || Date.parse(market.updatedAt) >= Date.parse(current.updatedAt)) {
      byId.set(market.id, market);
    }
  }
  const unique = [...byId.values()];
  return {
    registry: unique.map(marketToRegistryRecord),
    priceRecords: unique.flatMap(marketToPriceRecords),
    reactionWindows: unique.flatMap((market) => detectPriceReactionWindows(market)),
  };
}
