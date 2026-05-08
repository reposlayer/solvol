import type { ExternalArticle, SourceDocument } from "@/lib/domain/types";
import type { DiscoveryLane, DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import { buildPolymarketSearchUrl } from "@/lib/polymarket/links";
import type { JumpPoint, PublicMarketTrade } from "@/lib/polymarket/market-intel";
import { createMockMarketSource } from "@/lib/terminal/mock-source";
import {
  correlateMoveCauses,
  scoreMarketSignals,
  scoreMoveSignificance,
} from "@/lib/terminal/scoring";
import type {
  AlertEvent,
  AlertRule,
  EventItem,
  Market,
  MarketMove,
  MarketScores,
  MarketSourceStatus,
  MoveCorrelation,
  WalletActivity,
} from "@/lib/terminal/types";

export type DemoMarketSnapshotPayload = {
  id: string;
  question: string;
  conditionId: string | null;
  slug: string | null;
  eventSlug: string | null;
  eventTitle: string | null;
  polymarketUrl: string;
  category: string | null;
  yesTokenId: string;
  noTokenId: string | null;
  spread: number | null;
  midpoint: number | null;
  history: { t: number; p: number }[];
  jump: JumpPoint | null;
  outcomePrices: string;
  yesPrice: number | null;
  noPrice: number | null;
  volume24hr: number | null;
  volume1wk: number | null;
  liquidity: number | null;
  endDate: string | null;
  createdAt: string | null;
  dataMode: "mock";
};

export type DemoMarketIntelPayload = {
  id: string;
  question: string;
  slug: string | null;
  conditionId: string | null;
  category: string | null;
  yesTokenId: string;
  noTokenId: string | null;
  orderBook: null;
  trades: PublicMarketTrade[];
  news: ExternalArticle[];
  sources: SourceDocument[];
  newsTerms: string[];
  jump: JumpPoint | null;
  fetchedAt: string;
  dataMode: "mock";
  events: EventItem[];
  walletActivity: WalletActivity[];
  moves: MarketMove[];
  alertRules: AlertRule[];
  alertEvents: AlertEvent[];
  sourceStatus: MarketSourceStatus;
  scores: MarketScores;
  correlations: MoveCorrelation[];
};

function source() {
  return createMockMarketSource({ now: new Date().toISOString() });
}

function cloneMarketForRequestedId(market: Market, requestedId: string): Market {
  if (market.id === requestedId) return market;
  return {
    ...market,
    id: requestedId,
    title: `${market.title} (demo fallback)`,
    outcomes: market.outcomes.map((outcome) => ({
      ...outcome,
      id: outcome.id.replace(market.id, requestedId),
    })),
    priceHistory: market.priceHistory.map((point) => ({ ...point })),
  };
}

async function resolveMarket(marketId: string): Promise<Market> {
  const demo = source();
  const direct = await demo.getMarket(marketId);
  if (direct) return direct;
  const fallback = (await demo.listMarkets({ limit: 1 }))[0];
  if (!fallback) {
    throw new Error("Demo market source returned no markets");
  }
  return cloneMarketForRequestedId(fallback, marketId);
}

function toUnixSeconds(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

function marketMovePct(market: Market): number | null {
  const first = market.priceHistory[0]?.probability;
  const last = market.priceHistory.at(-1)?.probability;
  return first != null && last != null && first > 0 ? ((last - first) / first) * 100 : null;
}

function jumpFromMove(move: MarketMove | null): JumpPoint | null {
  if (!move) return null;
  const moveCents = (move.probabilityAfter - move.probabilityBefore) * 100;
  return {
    t: toUnixSeconds(move.timestamp),
    windowStart: toUnixSeconds(new Date(Date.parse(move.timestamp) - move.windowMinutes * 60 * 1000).toISOString()),
    windowEnd: toUnixSeconds(move.timestamp),
    priceBefore: move.probabilityBefore,
    priceAfter: move.probabilityAfter,
    movePercent:
      move.probabilityBefore > 0
        ? ((move.probabilityAfter - move.probabilityBefore) / move.probabilityBefore) * 100
        : 0,
    moveCents: Math.round(moveCents * 1000) / 1000,
    direction: moveCents >= 0 ? "YES" : "NO",
  };
}

function latestMoveForMarket(market: Market): MarketMove | null {
  if (market.priceHistory.length < 2) return null;
  const before = market.priceHistory.at(-2)!;
  const after = market.priceHistory.at(-1)!;
  return {
    id: `move-${market.id}`,
    marketId: market.id,
    timestamp: after.timestamp,
    windowMinutes: 30,
    probabilityBefore: before.probability,
    probabilityAfter: after.probability,
    volumeUsd: after.volumeUsd ?? market.volume24h / 8,
    source: "demo",
  };
}

function toDiscoveryRow(market: Market, lane: DiscoveryLane, eventCount: number, whaleCount: number): DiscoveryMarketRow {
  const scores = scoreMarketSignals(market, { eventCount, whaleCount });
  const closeMs = market.closeTime ? Date.parse(market.closeTime) : NaN;
  const hoursToClose = Number.isFinite(closeMs) ? (closeMs - Date.now()) / (1000 * 60 * 60) : null;
  const shortMovePct = marketMovePct(market);
  const dailyAvg = market.volume7d > 0 ? market.volume7d / 7 : market.volume24h;
  const volumeSpikeRatio = dailyAvg > 0 ? market.volume24h / dailyAvg : 1;
  return {
    id: market.id,
    question: market.title,
    slug: undefined,
    eventSlug: null,
    eventTitle: market.event,
    polymarketUrl: buildPolymarketSearchUrl(market.title),
    yesPrice: market.probability,
    volume24hr: market.volume24h,
    volume1wk: market.volume7d,
    liquidityNum: market.liquidity,
    endDate: market.closeTime,
    createdAt: market.createdAt,
    featured: lane === "hot",
    competitive: Math.min(1, scores.importanceScore / 100),
    terminalScore: scores.importanceScore,
    hoursToClose,
    volumeSpikeRatio,
    shortMovePct,
    sourceDensity: eventCount,
  };
}

function sortRowsForLane(rows: DiscoveryMarketRow[], lane: DiscoveryLane): DiscoveryMarketRow[] {
  const copy = [...rows];
  if (lane === "closing_soon" || lane === "deadline_risk") {
    return copy.sort((a, b) => (a.hoursToClose ?? Infinity) - (b.hoursToClose ?? Infinity));
  }
  if (lane === "all_markets" || lane === "high_volume") {
    return copy.sort((a, b) => b.volume24hr - a.volume24hr);
  }
  if (lane === "new") {
    return copy.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
  }
  if (lane === "anomaly") {
    return copy.sort((a, b) => Math.abs(b.shortMovePct ?? 0) - Math.abs(a.shortMovePct ?? 0));
  }
  if (lane === "catalyst_rich" || lane === "research_worthy") {
    return copy.sort((a, b) => (b.sourceDensity ?? 0) - (a.sourceDensity ?? 0));
  }
  return copy.sort((a, b) => (b.terminalScore ?? 0) - (a.terminalScore ?? 0));
}

export async function mockDiscoveryRows(
  lane: DiscoveryLane,
  opts?: { limit?: number; tagId?: string | undefined; query?: string | undefined },
): Promise<DiscoveryMarketRow[]> {
  const demo = source();
  const [markets, events, wallets] = await Promise.all([
    demo.listMarkets({ limit: 80 }),
    demo.listEvents({ limit: 80 }),
    demo.listWalletActivity({ limit: 80 }),
  ]);
  const rows = markets.map((market) =>
    toDiscoveryRow(
      market,
      lane,
      events.filter((event) => event.marketId === market.id).length,
      wallets.filter((wallet) => wallet.marketId === market.id).length,
    ),
  );
  const q = opts?.query?.trim().toLowerCase();
  const filtered = q
    ? rows.filter((row) => `${row.question} ${row.eventTitle ?? ""}`.toLowerCase().includes(q))
    : rows;
  return sortRowsForLane(filtered, lane).slice(0, Math.max(1, Math.min(opts?.limit ?? 40, 80)));
}

export async function mockMarketSnapshotPayload(marketId: string): Promise<DemoMarketSnapshotPayload> {
  const market = await resolveMarket(marketId);
  const move = latestMoveForMarket(market);
  const yes = market.outcomes[0]?.price ?? market.probability;
  const no = market.outcomes[1]?.price ?? 1 - yes;
  return {
    id: market.id,
    question: market.title,
    conditionId: `0x${market.id.padStart(64, "0").slice(0, 64)}`,
    slug: null,
    eventSlug: null,
    eventTitle: market.event,
    polymarketUrl: buildPolymarketSearchUrl(market.title),
    category: market.category,
    yesTokenId: `demo-yes-${market.id}`,
    noTokenId: `demo-no-${market.id}`,
    spread: 0.018,
    midpoint: yes,
    history: market.priceHistory.map((point) => ({
      t: toUnixSeconds(point.timestamp),
      p: point.probability,
    })),
    jump: jumpFromMove(move),
    outcomePrices: JSON.stringify([String(yes), String(no)]),
    yesPrice: yes,
    noPrice: no,
    volume24hr: market.volume24h,
    volume1wk: market.volume7d,
    liquidity: market.liquidity,
    endDate: market.closeTime,
    createdAt: market.createdAt,
    dataMode: "mock",
  };
}

function eventToArticle(event: EventItem): ExternalArticle {
  return {
    id: event.id,
    title: event.title,
    link: event.source.url ?? "#",
    publishedAt: event.timestamp,
    summary: event.summary,
    feedLabel: event.source.label,
    matchedTerms: [],
    relevanceScore: event.importance,
    ageMinutes: Math.max(0, Math.round((Date.now() - Date.parse(event.timestamp)) / 60000)),
    category: event.kind,
  };
}

function eventToSourceDocument(event: EventItem): SourceDocument {
  return {
    provider: "rss",
    externalId: event.id,
    title: event.title,
    url: event.source.url ?? null,
    publishedAt: event.timestamp,
    retrievedAt: event.timestamp,
    summary: event.summary,
    category: event.kind === "system" ? "event_graph" : "news",
    matchedTerms: ["demo", "mock"],
    reliability: event.source.kind === "mock" ? 0.35 : 0.7,
    metadata: {
      sourceId: event.source.id,
      sourceLabel: event.source.label,
      demo: event.source.kind === "mock",
    },
    origin: "fresh",
  };
}

function walletToTrade(wallet: WalletActivity): PublicMarketTrade {
  return {
    proxyWallet: wallet.walletAddress,
    side: wallet.side,
    asset: wallet.outcome,
    conditionId: `0x${wallet.marketId.padStart(64, "0").slice(0, 64)}`,
    size: wallet.size,
    price: wallet.price,
    timestamp: toUnixSeconds(wallet.timestamp),
    title: wallet.label ?? "Demo wallet",
    slug: null,
    eventSlug: null,
    outcome: wallet.outcome,
    outcomeIndex: wallet.outcome.toUpperCase() === "YES" ? 0 : 1,
    traderName: wallet.label,
    transactionHash: `0x${wallet.id.replace(/\W/g, "").padEnd(64, "0").slice(0, 64)}`,
    notional: wallet.notionalUsd,
  };
}

export async function mockMarketIntelPayload(marketId: string): Promise<DemoMarketIntelPayload> {
  const demo = source();
  const direct = await demo.getMarket(marketId);
  const baseMarket = direct ?? (await demo.listMarkets({ limit: 1 }))[0];
  if (!baseMarket) throw new Error("Demo market source returned no markets");
  const market = direct ?? cloneMarketForRequestedId(baseMarket, marketId);
  const sourceMarketId = baseMarket.id;
  const [rawEvents, rawWalletActivity, rawMoves, alertRules, rawAlertEvents, sourceStatus] = await Promise.all([
    demo.listEvents({ marketId: sourceMarketId, limit: 60 }),
    demo.listWalletActivity({ marketId: sourceMarketId, limit: 60 }),
    demo.listMoves(sourceMarketId),
    demo.listAlertRules(),
    demo.listAlertEvents(),
    demo.status(),
  ]);
  const events = rawEvents.map((event) =>
    event.marketId === sourceMarketId ? { ...event, marketId: market.id } : event,
  );
  const walletActivity = rawWalletActivity.map((activity) => ({
    ...activity,
    marketId: market.id,
  }));
  const moves = rawMoves.map((move) => ({
    ...move,
    marketId: market.id,
  }));
  const alertEvents = rawAlertEvents.map((event) =>
    event.marketId === sourceMarketId ? { ...event, marketId: market.id } : event,
  );
  const move = moves[0] ?? latestMoveForMarket(market);
  const scores = scoreMarketSignals(market, {
    eventCount: events.length,
    whaleCount: walletActivity.length,
  });
  const correlations = move ? [correlateMoveCauses(move, events, walletActivity)] : [];
  const yes = market.outcomes[0]?.price ?? market.probability;
  return {
    id: market.id,
    question: market.title,
    slug: null,
    conditionId: `0x${market.id.padStart(64, "0").slice(0, 64)}`,
    category: market.category,
    yesTokenId: `demo-yes-${market.id}`,
    noTokenId: `demo-no-${market.id}`,
    orderBook: null,
    trades: walletActivity.map(walletToTrade).sort((a, b) => b.timestamp - a.timestamp),
    news: events.filter((event) => event.kind === "news").map(eventToArticle),
    sources: events.map(eventToSourceDocument),
    newsTerms: market.title.split(/\s+/).filter((word) => word.length > 3).slice(0, 10),
    jump: jumpFromMove(move),
    fetchedAt: new Date().toISOString(),
    dataMode: "mock",
    events,
    walletActivity,
    moves: move ? [move] : [],
    alertRules,
    alertEvents,
    sourceStatus: {
      ...sourceStatus,
      message: `${sourceStatus.message} Move score ${move ? scoreMoveSignificance(move) : 0}. YES ${Math.round(yes * 100)}c.`,
    },
    scores,
    correlations,
  };
}
