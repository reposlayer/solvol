import type { TerminalIngestionRunResult } from "./ingestion-runner.ts";
import type { HealthState, SourceClass } from "./types";

export type TerminalBridgeMetrics = {
  computedAt: string;
  sources: {
    total: number;
    healthy: number;
    degraded: number;
    failing: number;
    paused: number;
    maxLagSeconds: number;
  };
  normalization: {
    fetched: number;
    accepted: number;
    successRate: number;
  };
  dedupe: {
    rawDocuments: number;
    newsItems: number;
    dedupeRatio: number;
  };
  clusters: {
    count: number;
    replayable: number;
    clusterPuritySample: number;
  };
  whyMoved: {
    candidates: number;
    officialSourceShare: number;
    contradictionRate: number;
    top1PrecisionSample: number | null;
    top3PrecisionSample: number | null;
  };
  replay: {
    deterministicClusterShare: number;
  };
};

export type TerminalDeadLetterEntry = {
  id: string;
  sourceId: string;
  sourceClass: SourceClass;
  health: HealthState;
  reason: string;
  attempts: number;
  rawBlobKey: string | null;
  replayable: boolean;
  createdAt: string;
};

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function secondsBetween(now: string, then: string | undefined): number {
  if (!then) return 0;
  const nowMs = Date.parse(now);
  const thenMs = Date.parse(then);
  if (!Number.isFinite(nowMs) || !Number.isFinite(thenMs)) return 0;
  return Math.max(0, Math.round((nowMs - thenMs) / 1000));
}

export function computeTerminalBridgeMetrics(
  result: TerminalIngestionRunResult,
  opts: { now?: string } = {},
): TerminalBridgeMetrics {
  const computedAt = opts.now ?? new Date().toISOString();
  const sourceCounts = result.sources.reduce<Record<HealthState, number>>((counts, source) => {
    counts[source.health.health] += 1;
    return counts;
  }, { degraded: 0, failing: 0, healthy: 0, paused: 0 });
  const fetched = result.sources.reduce((sum, source) => sum + source.fetched, 0);
  const accepted = result.sources.reduce((sum, source) => sum + source.accepted, 0);
  const rawDocuments = result.artifacts.rawDocuments?.length ?? 0;
  const newsItems = result.artifacts.newsItems.length;
  const replayableClusters = result.artifacts.eventClusters.filter((event) =>
    (event.memberNewsItemIds ?? []).length > 0 && (event.provenance ?? []).length > 0,
  ).length;
  const officialNews = result.artifacts.newsItems.filter((item) => item.sourceClass === "official").length;
  const contradictoryCandidates = result.artifacts.whyMovedCandidates.filter((candidate) =>
    (candidate.conflictingNewsItemIds ?? []).length > 0,
  ).length;
  const clusterCount = result.artifacts.eventClusters.length;

  return {
    computedAt,
    sources: {
      total: result.sources.length,
      healthy: sourceCounts.healthy,
      degraded: sourceCounts.degraded,
      failing: sourceCounts.failing,
      paused: sourceCounts.paused,
      maxLagSeconds: Math.max(
        0,
        ...result.sources.map((source) => secondsBetween(computedAt, source.health.lastSuccessAt)),
      ),
    },
    normalization: {
      fetched,
      accepted,
      successRate: fetched > 0 ? clamp01(accepted / fetched) : 1,
    },
    dedupe: {
      rawDocuments,
      newsItems,
      dedupeRatio: rawDocuments > 0 ? clamp01(1 - newsItems / rawDocuments) : 0,
    },
    clusters: {
      count: clusterCount,
      replayable: replayableClusters,
      clusterPuritySample: clusterCount > 0 ? clamp01(replayableClusters / clusterCount) : 1,
    },
    whyMoved: {
      candidates: result.artifacts.whyMovedCandidates.length,
      officialSourceShare: newsItems > 0 ? clamp01(officialNews / newsItems) : 0,
      contradictionRate: result.artifacts.whyMovedCandidates.length > 0
        ? clamp01(contradictoryCandidates / result.artifacts.whyMovedCandidates.length)
        : 0,
      top1PrecisionSample: null,
      top3PrecisionSample: null,
    },
    replay: {
      deterministicClusterShare: clusterCount > 0 ? clamp01(replayableClusters / clusterCount) : 1,
    },
  };
}

export function buildTerminalDeadLetterEntries(
  result: TerminalIngestionRunResult,
  opts: { now?: string } = {},
): TerminalDeadLetterEntry[] {
  const createdAt = opts.now ?? new Date().toISOString();
  return result.sources
    .filter((source) => source.health.health === "failing" || source.health.health === "paused")
    .map((source, index) => ({
      id: `${source.sourceId}:${createdAt}:${index}`,
      sourceId: source.sourceId,
      sourceClass: source.health.sourceClass,
      health: source.health.health,
      reason: source.health.lastError ?? source.health.health,
      attempts: source.health.consecutiveFailures,
      rawBlobKey: null,
      replayable: true,
      createdAt,
    }));
}
