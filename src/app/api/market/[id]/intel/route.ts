import { fetchNewsArticles } from "@/lib/context/rss";
import { collectFreshSourceDocuments } from "@/lib/context/source-engine";
import { dedupeSourceDocuments } from "@/lib/context/source-documents";
import {
  fetchGammaMarket,
  fetchMarketTrades,
  fetchOrderBook,
  fetchYesPriceHistory,
  getNoTokenFromMarket,
  getYesTokenFromMarket,
  resolveMarketEventContext,
  type MarketEventContext,
} from "@/lib/polymarket/client";
import {
  deriveNewsTerms,
  detectLargestJumpPoint,
  type PublicMarketTrade,
  summarizeOrderBook,
} from "@/lib/polymarket/market-intel";
import type { GammaMarket, PriceHistoryPoint } from "@/lib/polymarket/types";
import { researchErrorResponse } from "@/lib/research/http";
import { listSourceDocumentsForMarket, ResearchStoreError, userFromRequest } from "@/lib/research/supabase";
import type { ExternalArticle, SourceDocument } from "@/lib/domain/types";
import { mockMarketIntelPayload } from "@/lib/terminal/api-demo";
import {
  buildNewsFingerprint,
  clusterNewsItems,
  dedupeNewsItems,
  deterministicPayloadId,
  explainWhyMoved,
  extractEntityRefs,
  extractGeoRefs,
  scoreCredibility,
  scoreSentiment,
} from "@/lib/terminal/source-intelligence";
import {
  DEFAULT_TERMINAL_SOURCE_REGISTRY,
  buildRawDocumentMetadata,
  dataSourceStatusFromRegistry,
  normalizeSourceUrl,
} from "@/lib/terminal/source-registry";
import {
  correlateMoveCauses,
  scoreMarketSignals,
} from "@/lib/terminal/scoring";
import {
  detectPriceReactionWindows,
  reconcileMarketRegistry,
} from "@/lib/terminal/market-registry";
import type {
  DataSourceStatus,
  EventImpact,
  EventItem,
  EventItemKind,
  Market,
  MarketMove,
  NewsItem,
  SourceClass,
  MarketSourceStatus,
  TerminalDataSourceRef,
  WalletActivity,
} from "@/lib/terminal/types";

export const runtime = "nodejs";

const POLYMARKET_SOURCE: TerminalDataSourceRef = {
  id: "polymarket",
  label: "Polymarket",
  kind: "polymarket",
  url: "https://polymarket.com",
};

const FAILED_BRIDGE_PERSISTENCE_ROWS = {
  sourceRegistry: 0,
  sourceCursor: 0,
  rawDocument: 0,
  newsItem: 0,
  eventCluster: 0,
  eventClusterMember: 0,
  marketRegistry: 0,
  marketPrice: 0,
  whyMovedCandidate: 0,
  deliveryOutbox: 0,
};

function sourceClassForDocument(source: SourceDocument): SourceClass {
  if (source.category === "onchain") return "onchain";
  if (source.provider === "rss") return "rss";
  if (source.provider === "fred") return "official";
  return "news_api";
}

function sourceIdForDocument(source: SourceDocument): string {
  if (source.provider === "gdelt") return "gdelt-doc";
  if (source.provider === "coingecko") return "coingecko-context";
  if (source.provider === "fred") return "federal-reserve-rss";
  return source.provider;
}

function sourceDocumentToNewsItem(source: SourceDocument): NewsItem {
  const sourceId = sourceIdForDocument(source);
  const sourceClass = sourceClassForDocument(source);
  const observedAt = source.retrievedAt;
  const publishedAt = source.publishedAt ?? undefined;
  const canonicalUrl = normalizeSourceUrl(source.url);
  let publisherDomain: string | undefined;
  if (canonicalUrl) {
    try {
      publisherDomain = new URL(canonicalUrl).hostname.replace(/^www\./, "");
    } catch {
      publisherDomain = undefined;
    }
  }
  const raw = buildRawDocumentMetadata({
    sourceId,
    sourceClass,
    externalId: source.externalId,
    fetchedAt: observedAt,
    publishedAt,
    adapterVersion: `${sourceId}@source-document-v1`,
    rawPayload: source,
  });
  const summary = source.summary ?? undefined;
  const text = `${source.title} ${summary ?? ""} ${source.matchedTerms.join(" ")}`;

  return {
    id: deterministicPayloadId("news", {
      sourceId,
      externalId: source.externalId,
      publishedAt,
    }),
    sourceId,
    sourceClass,
    externalId: source.externalId,
    headline: source.title,
    summary,
    canonicalUrl,
    sourceUrl: canonicalUrl,
    publisherName: source.provider,
    publisherDomain,
    publishedAt,
    observedAt,
    occurredAt: publishedAt,
    categories: [source.category],
    topics: Array.from(new Set([...source.matchedTerms, source.category])),
    entities: extractEntityRefs(text),
    geo: extractGeoRefs(text),
    sentiment: scoreSentiment({
      headline: source.title,
      summary,
      sourceClass,
    }),
    credibility: scoreCredibility({
      sourceClass,
      canonicalUrl,
      publisherDomain,
    }),
    dedupeFingerprint: buildNewsFingerprint({
      headline: source.title,
      summary,
      publishedAt,
    }),
    provenance: [
      {
        sourceId: raw.sourceId,
        sourceClass: raw.sourceClass,
        externalId: raw.externalId,
        sourceUrl: canonicalUrl,
        fetchedAt: raw.fetchedAt,
        publishedAt: raw.publishedAt,
        rawBlobKey: raw.rawBlobKey,
        checksumSha256: raw.checksumSha256,
        adapterVersion: raw.adapterVersion,
      },
    ],
  };
}

function sourceHealthForBridge(
  sourceStatus: MarketSourceStatus,
  sources: SourceDocument[],
  fetchedAt: string,
): DataSourceStatus[] {
  const counts = new Map<string, number>();
  for (const source of sources) {
    const sourceId = sourceIdForDocument(source);
    counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
  }
  return DEFAULT_TERMINAL_SOURCE_REGISTRY.map((entry) =>
    dataSourceStatusFromRegistry(entry, {
      health: entry.sourceId === "polymarket-public"
        ? sourceStatus.healthy ? "healthy" : "degraded"
        : (counts.get(entry.sourceId) ?? 0) > 0 ? "healthy" : "degraded",
      lastAttemptAt: fetchedAt,
      lastSuccessAt: entry.sourceId === "polymarket-public" || (counts.get(entry.sourceId) ?? 0) > 0 ? fetchedAt : undefined,
      consecutiveFailures: entry.sourceId === "polymarket-public" || (counts.get(entry.sourceId) ?? 0) > 0 ? 0 : 1,
      itemsFetchedLastRun: entry.sourceId === "polymarket-public" ? 1 : counts.get(entry.sourceId) ?? 0,
      itemsAcceptedLastRun: entry.sourceId === "polymarket-public" ? 1 : counts.get(entry.sourceId) ?? 0,
      lastError: entry.sourceId === "polymarket-public" || (counts.get(entry.sourceId) ?? 0) > 0
        ? undefined
        : "No matching fixture/live documents in this market window.",
    }),
  );
}

function probabilityFromOutcomePrices(raw: string | undefined): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const yes = Number(parsed[0]);
    return Number.isFinite(yes) ? yes : null;
  } catch {
    return null;
  }
}

function normalizedMarket(
  market: GammaMarket,
  history: PriceHistoryPoint[],
  yesTokenId: string,
  noTokenId: string | null,
  eventContext: MarketEventContext,
): Market {
  const rawLiquidity = market.liquidityNum ?? Number(market.liquidity ?? 0);
  const historyPoints = history.map((point) => ({
    timestamp: new Date(point.t * 1000).toISOString(),
    probability: point.p,
  }));
  const yes = history.at(-1)?.p ?? probabilityFromOutcomePrices(market.outcomePrices) ?? 0;
  const no = yes > 0 ? 1 - yes : 0;
  return {
    id: market.id,
    source: {
      ...POLYMARKET_SOURCE,
      url: eventContext.polymarketUrl,
    },
    title: market.question,
    category: market.category ?? "Polymarket",
    event: eventContext.eventTitle ?? eventContext.eventSlug ?? String(market.eventId ?? market.id),
    url: eventContext.polymarketUrl,
    description: market.description ?? "Polymarket market.",
    resolutionRules: market.description ?? "See the source market page for source-provided resolution rules.",
    outcomes: [
      { id: yesTokenId, label: "YES", probability: yes, price: yes },
      { id: noTokenId ?? `${market.id}-no`, label: "NO", probability: no, price: no },
    ],
    probability: yes,
    volume24h: market.volume24hr ?? 0,
    volume7d: market.volume1wk ?? 0,
    liquidity: Number.isFinite(rawLiquidity) ? rawLiquidity : 0,
    openInterest: null,
    closeTime: market.endDate ?? null,
    createdAt: market.createdAt ?? null,
    updatedAt: new Date().toISOString(),
    status: market.closed ? "closed" : market.active === false ? "paused" : "open",
    priceHistory: historyPoints,
  };
}

function moveFromHistory(marketId: string, history: PriceHistoryPoint[], volumeUsd: number): MarketMove[] {
  const jump = detectLargestJumpPoint(history, { minMoveCents: 0.25 });
  if (!jump) return [];
  return [
    {
      id: `polymarket-move-${marketId}-${jump.t}`,
      marketId,
      timestamp: new Date(jump.t * 1000).toISOString(),
      windowMinutes: Math.max(1, Math.round((jump.windowEnd - jump.windowStart) / 60)),
      probabilityBefore: jump.priceBefore,
      probabilityAfter: jump.priceAfter,
      volumeUsd,
      source: "polymarket",
    },
  ];
}

function sourceKind(source: SourceDocument): EventItemKind {
  if (source.category === "price_feed") return "market_move";
  if (source.category === "event_graph") return "system";
  return "news";
}

function eventImpact(source: SourceDocument): EventImpact {
  const text = `${source.title} ${source.summary ?? ""}`.toLowerCase();
  if (/\b(delay|denied|fails?|miss|reject|below|loss|down|fall|drops?)\b/.test(text)) return "down";
  if (/\b(approve|wins?|beats?|above|surge|rise|up|record|launch)\b/.test(text)) return "up";
  return "neutral";
}

function sourceToEvent(marketId: string, source: SourceDocument): EventItem {
  return {
    id: `source-${source.provider}-${source.externalId}`,
    marketId,
    timestamp: source.publishedAt ?? source.retrievedAt,
    kind: sourceKind(source),
    title: source.title,
    summary: source.summary ?? `Matched source document from ${source.provider}.`,
    source: {
      id: source.provider,
      label: source.provider.replace(/_/g, " "),
      kind: "external",
      url: source.url,
    },
    impact: eventImpact(source),
    importance: Math.max(1, Math.min(100, Math.round((source.reliability ?? 0.45) * 100))),
  };
}

function articleToEvent(marketId: string, article: ExternalArticle): EventItem {
  return {
    id: `article-${article.id}`,
    marketId,
    timestamp: article.publishedAt,
    kind: "news",
    title: article.title,
    summary: article.summary ?? article.feedLabel,
    source: {
      id: article.feedLabel.toLowerCase().replace(/\W+/g, "-"),
      label: article.feedLabel,
      kind: "external",
      url: article.link,
    },
    impact: "neutral",
    importance: Math.max(1, Math.min(100, Math.round(article.relevanceScore ?? 45))),
  };
}

function tradeToWalletActivity(marketId: string, trade: PublicMarketTrade, index: number): WalletActivity {
  return {
    id: trade.transactionHash ?? `polymarket-trade-${trade.timestamp}-${index}`,
    marketId,
    walletAddress: trade.proxyWallet ?? "0x0000000000000000000000000000000000000000",
    label: trade.traderName,
    outcome: trade.outcome ?? "UNKNOWN",
    side: trade.side,
    size: trade.size,
    notionalUsd: trade.notional,
    price: trade.price,
    timestamp: new Date(trade.timestamp * 1000).toISOString(),
    source: "polymarket",
  };
}

function sourceStatus(started: number): MarketSourceStatus {
  return {
    id: "polymarket",
    label: "Polymarket",
    mode: "real",
    readOnly: true,
    healthy: true,
    latencyMs: Date.now() - started,
    checkedAt: new Date().toISOString(),
    message: "Public Gamma, CLOB, and Data API reads completed.",
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const started = Date.now();
  const { id } = await context.params;
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "35", 10);

  if (!id?.trim()) {
    return Response.json({ error: "Missing market id" }, { status: 400 });
  }

  try {
    await userFromRequest(request);
    const market = await fetchGammaMarket(id);
    const yesTokenId = getYesTokenFromMarket(market);
    const noTokenId = getNoTokenFromMarket(market);
    if (!yesTokenId) {
      return Response.json({ error: "No YES token for market" }, { status: 422 });
    }

    const terms = deriveNewsTerms(market.question, market.description);
    const [book, trades, history, news, storedSources, eventContext] = await Promise.all([
      fetchOrderBook(yesTokenId),
      fetchMarketTrades(market.conditionId, Number.isFinite(limit) ? limit : 35),
      fetchYesPriceHistory(yesTokenId),
      fetchNewsArticles(terms, { limit: 36 }),
      listSourceDocumentsForMarket(id, 40).catch(() => []),
      resolveMarketEventContext(market),
    ]);
    const jump = detectLargestJumpPoint(history, { minMoveCents: 0.25 });
    const freshSources = await collectFreshSourceDocuments({
      marketId: id,
      question: market.question,
      terms,
      windowStartIso: jump ? new Date(jump.windowStart * 1000).toISOString() : undefined,
      windowEndIso: jump ? new Date(jump.windowEnd * 1000).toISOString() : undefined,
      limit: 24,
    }).catch(() => []);
    const sources = dedupeSourceDocuments([...storedSources, ...freshSources]).slice(0, 60);
    const normalized = normalizedMarket(market, history, yesTokenId, noTokenId, eventContext);
    const registryReconciliation = reconcileMarketRegistry([normalized]);
    const moves = detectPriceReactionWindows(normalized, { minAbsChange: 0.0025 });
    const fallbackMoves = moveFromHistory(market.id, history, market.volume24hr ?? 0);
    const walletActivity = trades.map((trade, index) => tradeToWalletActivity(market.id, trade, index));
    const events = [
      ...sources.map((source) => sourceToEvent(market.id, source)),
      ...news.slice(0, 12).map((article) => articleToEvent(market.id, article)),
    ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 80);
    const scores = scoreMarketSignals(normalized, {
      eventCount: events.length,
      whaleCount: walletActivity.filter((wallet) => wallet.notionalUsd >= 25_000).length,
    });
    const marketMoves = moves.length ? moves : fallbackMoves;
    const correlations = marketMoves.map((move) => correlateMoveCauses(move, events, walletActivity));
    const fetchedAt = new Date().toISOString();
    const statusPayload = sourceStatus(started);
    const normalizedNews = dedupeNewsItems(sources.map(sourceDocumentToNewsItem));
    const eventClusters = clusterNewsItems(normalizedNews, { now: fetchedAt });
    const whyMovedCandidates = explainWhyMoved({
      market: normalized,
      events: eventClusters,
      moves: marketMoves,
      createdAt: fetchedAt,
    });
    const sourceHealth = sourceHealthForBridge(statusPayload, sources, fetchedAt);
    const persistence = {
      persisted: false,
      skippedReason: "Market intel GET is read-only; bridge persistence runs from ingestion jobs.",
      rows: FAILED_BRIDGE_PERSISTENCE_ROWS,
    };

    const orderBook = book
      ? {
          raw: book,
          summary: summarizeOrderBook(book, 10),
        }
      : null;

    return Response.json({
      id: market.id,
      question: market.question,
      slug: market.slug ?? null,
      eventSlug: eventContext.eventSlug,
      eventTitle: eventContext.eventTitle,
      polymarketUrl: eventContext.polymarketUrl,
      conditionId: market.conditionId ?? null,
      category: market.category ?? null,
      yesTokenId,
      noTokenId,
      orderBook,
      trades,
      news,
      sources,
      newsTerms: terms,
      jump,
      fetchedAt,
      events,
      walletActivity,
      moves: marketMoves,
      marketRegistry: registryReconciliation.registry,
      marketPrice: registryReconciliation.priceRecords,
      alertRules: [],
      alertEvents: [],
      sourceStatus: statusPayload,
      sourceHealth,
      scores,
      correlations,
      normalizedNews,
      eventClusters,
      whyMovedCandidates,
      persistence,
      dataMode: "real",
    });
  } catch (err) {
    if (err instanceof ResearchStoreError) return researchErrorResponse(err);
    if (process.env.SOLVOL_DISABLE_MOCK_FALLBACK !== "true") {
      const payload = await mockMarketIntelPayload(id);
      return Response.json({
        ...payload,
        dataMode: "mock",
        fallbackReason: err instanceof Error ? err.message : "Failed to load market intel",
      });
    }
    const message = err instanceof Error ? err.message : "Failed to load market intel";
    return Response.json({ error: message }, { status: 502 });
  }
}
