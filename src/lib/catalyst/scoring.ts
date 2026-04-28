import type {
  Catalyst,
  CatalystDirection,
  CatalystScoringBreakdown,
  CatalystSource,
  ExternalArticle,
  CryptoWindowStats,
  MarketMoveWindow,
} from "@/lib/domain/types";

function sourceReliabilityFromLabel(label: string): number {
  const l = label.toLowerCase();
  if (l.includes("reuters")) return 0.88;
  if (l.includes("coindesk")) return 0.78;
  return 0.55;
}

function temporalScore(articleIso: string, move: MarketMoveWindow): number {
  const articleMs = Date.parse(articleIso);
  const startMs = Date.parse(move.windowStart);
  const endMs = Date.parse(move.windowEnd);
  if (!Number.isFinite(articleMs) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 0.2;
  }

  if (articleMs > endMs + 15 * 60 * 1000) return 0.05;

  const hoursBeforeStart = (startMs - articleMs) / (1000 * 60 * 60);
  if (hoursBeforeStart >= 0 && hoursBeforeStart <= 6) {
    return Math.max(0.35, 1 - hoursBeforeStart / 12);
  }

  if (articleMs >= startMs - 36 * 60 * 60 * 1000 && articleMs <= endMs) {
    return 0.45;
  }

  return 0.15;
}

function volumeSupportScore(volumeMultiplierVs7dAvg: number): number {
  if (volumeMultiplierVs7dAvg <= 1) return 0.15;
  const x = Math.min(4, volumeMultiplierVs7dAvg - 1);
  return Math.min(1, 0.2 + x * 0.25);
}

function liquidityPenaltyFactor(liquidityUsd: number | undefined): number {
  if (liquidityUsd === undefined || liquidityUsd <= 0) return 0;
  if (liquidityUsd < 15_000) return 0.35;
  if (liquidityUsd < 50_000) return 0.18;
  return 0;
}

function guessDirectionFromText(text: string, moveSign: number): CatalystDirection {
  const t = text.toLowerCase();
  const positive =
    /\b(surge|rally|gain|beat|win|approve|cut rates|bull|up|high|passed)\b/.test(t);
  const negative =
    /\b(crash|fall|drop|lose|reject|hike|bear|down|low|failed|lawsuit)\b/.test(t);
  if (positive && !negative) return moveSign >= 0 ? "YES" : "NO";
  if (negative && !positive) return moveSign >= 0 ? "NO" : "YES";
  return "unclear";
}

function aggregateConfidence(parts: {
  temporal: number;
  source: number;
  volume?: number;
  cross?: number;
  liquidityPenalty: number;
}): number {
  const base =
    0.42 * parts.temporal +
    0.28 * parts.source +
    (parts.volume !== undefined ? 0.18 * parts.volume : 0) +
    (parts.cross !== undefined ? 0.12 * parts.cross : 0);
  const penalized = Math.max(0, Math.min(1, base - parts.liquidityPenalty));
  return Math.round(penalized * 100);
}

export function scoreNewsArticles(params: {
  marketId: string;
  title: string;
  articles: ExternalArticle[];
  move: MarketMoveWindow;
  mainMoveSign: number;
  volumeMultiplierVs7dAvg: number;
  liquidityUsd?: number;
  crossMarketSupport?: number;
}): Catalyst[] {
  const retrievedAt = new Date().toISOString();
  const liquidityPenalty = liquidityPenaltyFactor(params.liquidityUsd);

  const ranked = params.articles.map((a) => {
    const temporal = temporalScore(a.publishedAt, params.move);
    const sourceReliability = sourceReliabilityFromLabel(a.feedLabel);
    const volume = volumeSupportScore(params.volumeMultiplierVs7dAvg);
    const cross = params.crossMarketSupport ?? 0;
    const direction = guessDirectionFromText(`${a.title} ${a.summary ?? ""}`, params.mainMoveSign);

    const breakdown: CatalystScoringBreakdown = {
      temporalProximity: temporal,
      sourceReliability,
      volumeSupport: volume,
      crossMarketSupport: cross,
      liquidityPenalty,
    };

    const confidence = aggregateConfidence({
      temporal,
      source: sourceReliability,
      volume,
      cross,
      liquidityPenalty,
    });

    const evidence = [
      `Article timestamp ${a.publishedAt} vs move window ${params.move.windowStart} → ${params.move.windowEnd}`,
      `Feed reliability tier: ${sourceReliability.toFixed(2)}`,
    ];

    const catalyst: Catalyst = {
      marketId: params.marketId,
      title: a.title,
      source: "news" satisfies CatalystSource,
      timestamp: a.publishedAt,
      summary: a.summary?.slice(0, 280) ?? a.title,
      affectedEntities: [],
      confidence,
      direction,
      evidence,
      sourceUrl: a.link,
      retrievedAt,
      scoringBreakdown: breakdown,
    };

    return { catalyst, score: confidence };
  });

  ranked.sort((x, y) => y.score - x.score);
  return ranked.slice(0, 5).map((x) => x.catalyst);
}

export function scoreCryptoFeed(params: {
  marketId: string;
  move: MarketMoveWindow;
  stats: CryptoWindowStats;
  volumeMultiplierVs7dAvg: number;
  liquidityUsd?: number;
  crossMarketSupport?: number;
}): Catalyst | null {
  const liquidityPenalty = liquidityPenaltyFactor(params.liquidityUsd);
  const moveSign = params.move.priceAfter >= params.move.priceBefore ? 1 : -1;
  const cryptoSign = params.stats.changePercent >= 0 ? 1 : -1;
  const aligned = moveSign === cryptoSign;

  const temporal = 0.55;
  const sourceReliability = 0.82;
  const volume = volumeSupportScore(params.volumeMultiplierVs7dAvg);
  const cross = params.crossMarketSupport ?? 0;

  const confidence = aggregateConfidence({
    temporal,
    source: sourceReliability,
    volume,
    cross,
    liquidityPenalty: aligned ? liquidityPenalty : liquidityPenalty + 0.15,
  });

  const breakdown: CatalystScoringBreakdown = {
    temporalProximity: temporal,
    sourceReliability,
    volumeSupport: volume,
    crossMarketSupport: cross,
    liquidityPenalty,
  };

  const summary = `${params.stats.symbol} moved ${params.stats.changePercent.toFixed(2)}% over the same window in CoinGecko spot data.`;

  const catalyst: Catalyst = {
    marketId: params.marketId,
    title: `${params.stats.symbol} spot move (${params.stats.changePercent >= 0 ? "+" : ""}${params.stats.changePercent.toFixed(2)}%)`,
    source: "price_feed",
    timestamp: params.move.windowEnd,
    summary,
    affectedEntities: [params.stats.symbol],
    confidence,
    direction: aligned ? (moveSign > 0 ? "YES" : "NO") : "unclear",
    evidence: [
      `Spot window roughly aligned with ${params.move.windowStart} → ${params.move.windowEnd}`,
      aligned ? "Direction matches YES implied probability step sign." : "Direction does not cleanly match YES step sign.",
    ],
    sourceUrl: "https://www.coingecko.com/",
    retrievedAt: new Date().toISOString(),
    scoringBreakdown: breakdown,
  };

  return catalyst;
}
