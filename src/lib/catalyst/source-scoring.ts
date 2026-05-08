import type {
  Catalyst,
  CatalystDirection,
  CatalystScoringBreakdown,
  MarketMoveWindow,
  SourceDocument,
} from "../domain/types";

function temporalScore(doc: SourceDocument, move: MarketMoveWindow): number {
  if (!doc.publishedAt) {
    return doc.category === "entity_context" ? 0.3 : 0.2;
  }
  const docMs = Date.parse(doc.publishedAt);
  const startMs = Date.parse(move.windowStart);
  const endMs = Date.parse(move.windowEnd);
  if (!Number.isFinite(docMs) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0.2;
  if (docMs >= startMs && docMs <= endMs) return 1;
  const hoursBefore = (startMs - docMs) / 3_600_000;
  if (hoursBefore >= 0 && hoursBefore <= 6) return Math.max(0.45, 1 - hoursBefore / 10);
  const hoursAfter = (docMs - endMs) / 3_600_000;
  if (hoursAfter >= 0 && hoursAfter <= 2) return 0.35;
  return 0.15;
}

function volumeSupportScore(volumeMultiplierVs7dAvg: number): number {
  if (volumeMultiplierVs7dAvg <= 1) return 0.15;
  return Math.min(1, 0.2 + Math.min(4, volumeMultiplierVs7dAvg - 1) * 0.25);
}

function liquidityPenaltyFactor(liquidityUsd: number | undefined): number {
  if (liquidityUsd === undefined || liquidityUsd <= 0) return 0;
  if (liquidityUsd < 15_000) return 0.35;
  if (liquidityUsd < 50_000) return 0.18;
  return 0;
}

function directionFromText(text: string, moveSign: number): CatalystDirection {
  const t = text.toLowerCase();
  const positive = /\b(surge|rally|gain|beat|win|approve|cut|bull|up|high|passed|rise|raises)\b/.test(t);
  const negative = /\b(crash|fall|drop|lose|reject|hike|bear|down|low|failed|lawsuit|slump)\b/.test(t);
  if (positive && !negative) return moveSign >= 0 ? "YES" : "NO";
  if (negative && !positive) return moveSign >= 0 ? "NO" : "YES";
  return "unclear";
}

function categoryBoost(doc: SourceDocument): number {
  if (doc.category === "event_graph") return 0.1;
  if (doc.category === "macro") return 0.08;
  if (doc.category === "price_feed") return 0.06;
  if (doc.category === "entity_context") return -0.12;
  return 0;
}

export function scoreSourceDocuments(params: {
  marketId: string;
  documents: SourceDocument[];
  move: MarketMoveWindow;
  mainMoveSign: number;
  volumeMultiplierVs7dAvg: number;
  liquidityUsd?: number;
  crossMarketSupport?: number;
}): Catalyst[] {
  const liquidityPenalty = liquidityPenaltyFactor(params.liquidityUsd);
  const volume = volumeSupportScore(params.volumeMultiplierVs7dAvg);
  const cross = params.crossMarketSupport ?? 0;

  const scored = params.documents.map((doc) => {
    const temporal = temporalScore(doc, params.move);
    const source = Math.max(0, Math.min(1, doc.reliability));
    const base = 0.4 * temporal + 0.28 * source + 0.16 * volume + 0.1 * cross + categoryBoost(doc);
    const confidence = Math.round(Math.max(0, Math.min(0.96, base - liquidityPenalty)) * 100);
    const breakdown: CatalystScoringBreakdown = {
      temporalProximity: temporal,
      sourceReliability: source,
      volumeSupport: volume,
      crossMarketSupport: cross,
      liquidityPenalty,
    };
    const title = doc.title;
    const summary = doc.summary ?? doc.title;
    return {
      catalyst: {
        marketId: params.marketId,
        title,
        source: doc.category,
        timestamp: doc.publishedAt ?? doc.retrievedAt,
        summary: summary.slice(0, 320),
        affectedEntities: doc.matchedTerms,
        confidence,
        direction: directionFromText(`${doc.title} ${doc.summary ?? ""}`, params.mainMoveSign),
        evidence: [
          `${doc.provider} ${doc.origin ?? "fresh"} source matched ${doc.matchedTerms.length} term(s).`,
          doc.publishedAt
            ? `Source timestamp ${doc.publishedAt} vs move window ${params.move.windowStart} → ${params.move.windowEnd}`
            : "Entity/context source has no event timestamp.",
        ],
        sourceUrl: doc.url,
        retrievedAt: doc.retrievedAt,
        rawSnippetId: `${doc.provider}:${doc.externalId}`,
        scoringBreakdown: breakdown,
      } satisfies Catalyst,
      score: confidence,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map((row) => row.catalyst);
}
