import type { GammaMarket } from "@/lib/polymarket/types";
import type { MarketMoveExplanation, MarketMoveWindow } from "@/lib/domain/types";
import { fetchGammaMarket, fetchSpread, getYesTokenFromMarket, fetchYesPriceHistory } from "@/lib/polymarket/client";
import { detectLargestStepMove } from "@/lib/polymarket/move-detection";
import { extractEntities } from "@/lib/entities/extract";
import { fetchNewsArticles } from "@/lib/context/rss";
import { fetchCryptoWindowChange } from "@/lib/context/coingecko";
import { scoreCryptoFeed, scoreNewsArticles } from "@/lib/catalyst/scoring";
import { findRelatedMarkets } from "@/lib/related/markets";
import { narrateExplanation } from "@/lib/catalyst/narrator";
import { toConfidenceBand } from "@/lib/util/confidence";

function volumeMultiplier(market: GammaMarket): number {
  const v24 = market.volume24hr ?? 0;
  const vwk = market.volume1wk ?? 0;
  const dailyAvg = vwk > 0 ? vwk / 7 : Math.max(v24, 1);
  const ratio = v24 / Math.max(dailyAvg, 1);
  return Math.min(Math.max(ratio, 0.1), 25);
}

function liquidityUsd(market: GammaMarket): number | undefined {
  const n = market.liquidityNum ?? Number(market.liquidity ?? 0);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function fallbackMoveFromHistory(
  history: import("@/lib/polymarket/types").PriceHistoryPoint[],
): MarketMoveWindow | null {
  if (history.length < 2) return null;
  const prev = history[history.length - 2]!;
  const cur = history[history.length - 1]!;
  const movePct = prev.p > 0 ? ((cur.p - prev.p) / prev.p) * 100 : 0;
  return {
    windowStart: new Date(prev.t * 1000).toISOString(),
    windowEnd: new Date(cur.t * 1000).toISOString(),
    priceBefore: prev.p,
    priceAfter: cur.p,
    movePercent: movePct,
    baselineVolume24h: 0,
    volumeInWindowEstimate: 0,
    volumeMultiplierVs7dAvg: 1,
  };
}

export async function explainMarketMove(marketId: string): Promise<MarketMoveExplanation> {
  const market = await fetchGammaMarket(marketId);
  const yes = getYesTokenFromMarket(market);
  if (!yes) {
    throw new Error("Market has no YES clob token id");
  }

  const history = await fetchYesPriceHistory(yes);
  let move =
    detectLargestStepMove(history, { minAbsMovePercent: 0.2 }) ??
    fallbackMoveFromHistory(history);

  if (!move) {
    throw new Error("Insufficient Polymarket price history to characterize a move");
  }

  const volMult = volumeMultiplier(market);
  const liq = liquidityUsd(market);
  const v24 = market.volume24hr ?? 0;

  move = {
    ...move,
    baselineVolume24h: v24,
    volumeInWindowEstimate: v24,
    volumeMultiplierVs7dAvg: volMult,
    liquidityUsd: liq,
  };

  const spreadBefore = await fetchSpread(yes);
  move = { ...move, spreadBefore: spreadBefore ?? undefined, spreadAfter: spreadBefore ?? undefined };

  const entities = await extractEntities(market.question, market.description ?? "");
  const queryTerms = [
    ...entities.tickers,
    ...entities.topics,
    ...entities.people,
    ...entities.relatedTerms,
    ...entities.dates,
  ].slice(0, 18);

  const articles = await fetchNewsArticles(queryTerms);

  const mainMoveSign = move.priceAfter >= move.priceBefore ? 1 : -1;

  const related = await findRelatedMarkets(
    `${entities.topics.slice(0, 4).join(" ")} ${entities.tickers.join(" ")}`.trim(),
    marketId,
    mainMoveSign,
    4,
  );

  const alignedPeers = related.filter((r) => r.directionAligned).length;
  const crossSupport =
    related.length === 0 ? 0 : Math.min(1, alignedPeers / Math.max(1, related.length));

  const crossMarketSummary =
    alignedPeers >= 2 && related.length >= 2
      ? "Multiple related markets repriced in the same direction around this window — suggests a theme-wide catalyst rather than an idiosyncratic flicker."
      : alignedPeers === 0
        ? "Related markets did not show a clean directional cluster in the sampled window."
        : "Some related markets moved similarly, but the cluster is not decisive.";

  let catalysts = scoreNewsArticles({
    marketId,
    title: market.question,
    articles,
    move,
    mainMoveSign,
    volumeMultiplierVs7dAvg: volMult,
    liquidityUsd: liq,
    crossMarketSupport: crossSupport,
  });

  const windowStartSec = Date.parse(move.windowStart) / 1000;
  const windowEndSec = Date.parse(move.windowEnd) / 1000;

  for (const t of entities.tickers) {
    const stats = await fetchCryptoWindowChange(t, windowStartSec, windowEndSec);
    if (!stats) continue;
    const c = scoreCryptoFeed({
      marketId,
      move,
      stats,
      volumeMultiplierVs7dAvg: volMult,
      liquidityUsd: liq,
      crossMarketSupport: crossSupport,
    });
    if (c) catalysts.push(c);
  }

  catalysts.sort((a, b) => b.confidence - a.confidence);
  catalysts = catalysts.slice(0, 6);

  const topConfidence =
    catalysts.length === 0 ? 12 : Math.min(95, Math.max(...catalysts.map((c) => c.confidence)));

  const weak =
    catalysts.length === 0 ||
    topConfidence < 35 ||
    (catalysts[0]?.source === "news" && catalysts[0]!.confidence < 40);

  const possibleCausesWhenWeak = weak
    ? [
        "Thin liquidity / wide spread causing noisy repricing",
        "Large discretionary trade (“whale”) without public headline linkage",
        "Cross-market arbitrage or portfolio hedging flows",
        "Stale RSS ingestion delays versus actual headline times",
      ]
    : [];

  const draft: MarketMoveExplanation = {
    marketId,
    marketTitle: market.question,
    priceBefore: move.priceBefore,
    priceAfter: move.priceAfter,
    movePercent: move.movePercent,
    volumeChange: volMult,
    move,
    likelyCatalysts: catalysts,
    confidence: weak ? Math.min(topConfidence, 28) : topConfidence,
    confidenceBand: toConfidenceBand(weak ? Math.min(topConfidence, 28) : topConfidence),
    explanation: "",
    possibleCausesWhenWeak: weak ? possibleCausesWhenWeak : [],
    relatedMarkets: related,
    crossMarketSummary,
    sourcesByCategory: {
      news: catalysts
        .filter((c) => c.source === "news")
        .map((c) => ({ label: c.title, url: c.sourceUrl ?? undefined })),
      price_feed: catalysts
        .filter((c) => c.source === "price_feed")
        .map((c) => ({ label: c.title, url: c.sourceUrl ?? undefined })),
    },
  };

  const explanation = await narrateExplanation(draft);

  return { ...draft, explanation };
}
