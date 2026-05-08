import {
  fetchDiscoveryLane,
  type DiscoveryLane,
  type DiscoveryMarketRow,
} from "@/lib/polymarket/discovery";
import {
  fetchGammaMarket,
  fetchMarketTrades,
  fetchYesPriceHistory,
  getNoTokenFromMarket,
  getYesTokenFromMarket,
  resolveMarketEventContext,
  type MarketEventContext,
} from "@/lib/polymarket/client";
import { buildPolymarketMarketUrl } from "@/lib/polymarket/links";
import { publicPolymarketStatusDescriptor } from "@/lib/polymarket/public-api";
import type { GammaMarket } from "@/lib/polymarket/types";
import type {
  EventItem,
  Market,
  MarketMove,
  MarketSource,
  MarketSourceStatus,
  WalletActivity,
} from "@/lib/terminal/types";

function parseOutcomePrices(raw: string | undefined): [number | null, number | null] {
  if (!raw) return [null, null];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [null, null];
    const yes = Number(arr[0]);
    const no = Number(arr[1]);
    return [Number.isFinite(yes) ? yes : null, Number.isFinite(no) ? no : null];
  } catch {
    return [null, null];
  }
}

function liquidity(market: GammaMarket | DiscoveryMarketRow): number {
  const n =
    "liquidityNum" in market
      ? market.liquidityNum
      : market.liquidityNum ?? Number(market.liquidity ?? 0);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function rowToMarket(row: DiscoveryMarketRow): Market {
  const yes = row.yesPrice ?? 0;
  const no = yes > 0 ? 1 - yes : 0;
  const sourceUrl =
    row.polymarketUrl ??
    buildPolymarketMarketUrl({
      eventSlug: row.eventSlug,
      question: row.question,
      marketSlug: row.slug,
      id: row.id,
    });
  return {
    id: row.id,
    source: {
      id: "polymarket",
      label: "Polymarket",
      kind: "polymarket",
      url: sourceUrl,
    },
    title: row.question,
    category: "Polymarket",
    event: row.eventTitle ?? row.eventSlug ?? row.slug ?? row.id,
    url: sourceUrl,
    description: "Polymarket market discovered from the public Gamma API.",
    resolutionRules: "See the source market page for resolution rules.",
    outcomes: [
      { id: `${row.id}-yes`, label: "YES", probability: yes, price: yes },
      { id: `${row.id}-no`, label: "NO", probability: no, price: no },
    ],
    probability: yes,
    volume24h: row.volume24hr,
    volume7d: row.volume1wk,
    liquidity: row.liquidityNum,
    openInterest: null,
    closeTime: row.endDate,
    createdAt: row.createdAt,
    updatedAt: new Date().toISOString(),
    status: "open",
    priceHistory: [],
  };
}

function gammaToMarket(
  market: GammaMarket,
  history: { t: number; p: number }[],
  eventContext: MarketEventContext,
): Market {
  const [yesRaw, noRaw] = parseOutcomePrices(market.outcomePrices);
  const latest = history.at(-1)?.p;
  const yes = latest ?? yesRaw ?? 0;
  const no = noRaw ?? (yes > 0 ? 1 - yes : 0);
  return {
    id: market.id,
    source: {
      id: "polymarket",
      label: "Polymarket",
      kind: "polymarket",
      url: eventContext.polymarketUrl,
    },
    title: market.question,
    category: market.category ?? "Polymarket",
    event: eventContext.eventTitle ?? eventContext.eventSlug ?? String(market.eventId ?? market.id),
    url: eventContext.polymarketUrl,
    description: market.description ?? "Polymarket market.",
    resolutionRules: market.description ?? "See the source market page for resolution rules.",
    outcomes: [
      { id: getYesTokenFromMarket(market) ?? `${market.id}-yes`, label: "YES", probability: yes, price: yes },
      { id: getNoTokenFromMarket(market) ?? `${market.id}-no`, label: "NO", probability: no, price: no },
    ],
    probability: yes,
    volume24h: market.volume24hr ?? 0,
    volume7d: market.volume1wk ?? 0,
    liquidity: liquidity(market),
    openInterest: null,
    closeTime: market.endDate ?? null,
    createdAt: market.createdAt ?? null,
    updatedAt: new Date().toISOString(),
    status: market.closed ? "closed" : market.active === false ? "paused" : "open",
    priceHistory: history.map((point) => ({
      timestamp: new Date(point.t * 1000).toISOString(),
      probability: point.p,
    })),
  };
}

function movesFromMarket(market: Market): MarketMove[] {
  if (market.priceHistory.length < 2) return [];
  let bestIndex = 1;
  let bestDelta = 0;
  for (let i = 1; i < market.priceHistory.length; i++) {
    const prev = market.priceHistory[i - 1]!;
    const cur = market.priceHistory[i]!;
    const delta = Math.abs(cur.probability - prev.probability);
    if (delta > bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }
  const before = market.priceHistory[bestIndex - 1]!;
  const after = market.priceHistory[bestIndex]!;
  return [
    {
      id: `polymarket-move-${market.id}-${after.timestamp}`,
      marketId: market.id,
      timestamp: after.timestamp,
      windowMinutes: Math.max(1, Math.round((Date.parse(after.timestamp) - Date.parse(before.timestamp)) / 60000)),
      probabilityBefore: before.probability,
      probabilityAfter: after.probability,
      volumeUsd: market.volume24h,
      source: "polymarket",
    },
  ];
}

function laneForQuery(query?: { moversOnly?: boolean; category?: string }): DiscoveryLane {
  if (query?.moversOnly) return "anomaly";
  if (query?.category) return "research_worthy";
  return "hot";
}

export function createPolymarketMarketSource(): MarketSource {
  return {
    id: "polymarket",
    label: "Polymarket",
    mode: "real",
    readOnly: true,
    async listMarkets(query) {
      const rows = await fetchDiscoveryLane(laneForQuery(query), { limit: query?.limit ?? 40 });
      let markets = rows.map(rowToMarket);
      if (query?.search) {
        const q = query.search.toLowerCase();
        markets = markets.filter((market) => `${market.title} ${market.category}`.toLowerCase().includes(q));
      }
      return markets;
    },
    async getMarket(marketId) {
      const market = await fetchGammaMarket(marketId);
      const yesToken = getYesTokenFromMarket(market);
      const [history, eventContext] = await Promise.all([
        yesToken ? fetchYesPriceHistory(yesToken) : Promise.resolve([]),
        resolveMarketEventContext(market),
      ]);
      return gammaToMarket(market, history, eventContext);
    },
    async listMoves(marketId) {
      if (!marketId) return [];
      const market = await this.getMarket(marketId);
      return market ? movesFromMarket(market) : [];
    },
    async listWalletActivity(query) {
      if (!query?.marketId) return [];
      const market = await fetchGammaMarket(query.marketId);
      const trades = await fetchMarketTrades(market.conditionId, query.limit ?? 40);
      return trades.map<WalletActivity>((trade, index) => ({
        id: trade.transactionHash ?? `polymarket-trade-${index}`,
        marketId: query.marketId!,
        walletAddress: trade.proxyWallet ?? "0x0000000000000000000000000000000000000000",
        label: trade.traderName,
        outcome: trade.outcome ?? "UNKNOWN",
        side: trade.side,
        size: trade.size,
        notionalUsd: trade.notional,
        price: trade.price,
        timestamp: new Date(trade.timestamp * 1000).toISOString(),
        source: "polymarket",
      }));
    },
    async listEvents(): Promise<EventItem[]> {
      return [];
    },
    async listAlertRules() {
      return [];
    },
    async listAlertEvents() {
      return [];
    },
    async status(): Promise<MarketSourceStatus> {
      const started = Date.now();
      const descriptor = publicPolymarketStatusDescriptor();
      try {
        await fetchDiscoveryLane("high_volume", { limit: 1 });
        return {
          id: "polymarket",
          label: "Polymarket",
          mode: "real",
          readOnly: true,
          healthy: true,
          latencyMs: Date.now() - started,
          checkedAt: new Date().toISOString(),
          message: `${descriptor} Status probe reachable.`,
        };
      } catch (err) {
        return {
          id: "polymarket",
          label: "Polymarket",
          mode: "real",
          readOnly: true,
          healthy: false,
          latencyMs: Date.now() - started,
          checkedAt: new Date().toISOString(),
          message: err instanceof Error ? `${descriptor} ${err.message}` : `${descriptor} Polymarket status check failed`,
        };
      }
    },
  };
}
