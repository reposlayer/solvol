import type {
  DataSourceStatus,
  EventItem,
  MarketMove,
  NewsItem,
  SourceClass,
  SourceRegistryEntry,
} from "./types";
import {
  buildNewsFingerprint,
  clusterNewsItems,
  dedupeNewsItems,
  deterministicPayloadId,
  extractEntityRefs,
  extractGeoRefs,
  scoreCredibility,
  scoreSentiment,
} from "./source-intelligence.ts";
import {
  DEFAULT_TERMINAL_SOURCE_REGISTRY,
  buildRawDocumentMetadata,
  dataSourceStatusFromRegistry,
  normalizeSourceUrl,
} from "./source-registry.ts";

export const TERMINAL_SYNTHETIC_SCENARIOS = [
  "breaking-news-spike",
  "duplicate-burst",
  "source-outage",
  "rate-limit-incident",
  "price-move",
] as const;

export type TerminalSyntheticScenarioName = typeof TERMINAL_SYNTHETIC_SCENARIOS[number];

export type TerminalSyntheticScenarioInput = {
  scenario: TerminalSyntheticScenarioName;
  now?: string;
  marketId?: string;
};

export type TerminalSyntheticScenarioResult = {
  readOnly: true;
  scenario: TerminalSyntheticScenarioName;
  generatedAt: string;
  rawItemsGenerated: number;
  newsItems: NewsItem[];
  eventClusters: EventItem[];
  sourceHealth: DataSourceStatus[];
  marketMoves: MarketMove[];
};

type SyntheticRawNews = {
  sourceId: string;
  sourceClass: SourceClass;
  externalId: string;
  headline: string;
  summary: string;
  publishedAt: string;
  sourceUrl: string;
  publisherName: string;
  publisherDomain: string;
  countryCode?: string;
  topics: string[];
  rawPayload: Record<string, unknown>;
};

function registry(sourceId: string): SourceRegistryEntry {
  const entry = DEFAULT_TERMINAL_SOURCE_REGISTRY.find((source) => source.sourceId === sourceId);
  if (!entry) throw new Error(`missing source registry entry: ${sourceId}`);
  return entry;
}

function isoPlusMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function newsItemFromRaw(raw: SyntheticRawNews, observedAt: string): NewsItem {
  const entry = registry(raw.sourceId);
  const canonicalUrl = normalizeSourceUrl(raw.sourceUrl);
  const provenance = buildRawDocumentMetadata({
    sourceId: raw.sourceId,
    sourceClass: raw.sourceClass,
    externalId: raw.externalId,
    fetchedAt: observedAt,
    publishedAt: raw.publishedAt,
    adapterVersion: entry.adapterVersion,
    rawPayload: raw.rawPayload,
  });
  const text = `${raw.headline} ${raw.summary}`;

  return {
    id: deterministicPayloadId("synthetic-news", {
      sourceId: raw.sourceId,
      externalId: raw.externalId,
      publishedAt: raw.publishedAt,
    }),
    sourceId: raw.sourceId,
    sourceClass: raw.sourceClass,
    externalId: raw.externalId,
    headline: raw.headline,
    summary: raw.summary,
    canonicalUrl,
    sourceUrl: canonicalUrl,
    publisherName: raw.publisherName,
    publisherDomain: raw.publisherDomain,
    countryCode: raw.countryCode,
    publishedAt: raw.publishedAt,
    observedAt,
    occurredAt: raw.publishedAt,
    categories: ["synthetic_drill"],
    topics: raw.topics,
    entities: extractEntityRefs(text),
    geo: extractGeoRefs(text, raw.countryCode),
    sentiment: scoreSentiment({
      headline: raw.headline,
      summary: raw.summary,
      sourceClass: raw.sourceClass,
    }),
    credibility: scoreCredibility({
      sourceClass: raw.sourceClass,
      canonicalUrl,
      publisherDomain: raw.publisherDomain,
    }),
    dedupeFingerprint: buildNewsFingerprint({
      headline: raw.headline,
      summary: raw.summary,
      publishedAt: raw.publishedAt,
    }),
    provenance: [provenance],
  };
}

function baseNews(now: string): SyntheticRawNews {
  return {
    sourceId: "federal-reserve-rss",
    sourceClass: "official",
    externalId: `synthetic:fed:${now}`,
    headline: "Federal Reserve approves emergency rate cut timeline",
    summary: "Synthetic drill item for a breaking macro catalyst and why-moved card validation.",
    publishedAt: now,
    sourceUrl: "https://www.federalreserve.gov/newsevents/pressreleases/synthetic-drill.htm",
    publisherName: "Federal Reserve",
    publisherDomain: "federalreserve.gov",
    countryCode: "US",
    topics: ["Federal Reserve", "FOMC", "rates", "synthetic"],
    rawPayload: {
      drill: true,
      source: "synthetic",
      headline: "Federal Reserve approves emergency rate cut timeline",
      observedAt: now,
    },
  };
}

function rawNewsForScenario(scenario: TerminalSyntheticScenarioName, now: string): SyntheticRawNews[] {
  if (scenario === "breaking-news-spike") return [baseNews(now)];
  if (scenario === "duplicate-burst") {
    const raw = baseNews(now);
    return [0, 1, 2].map((index) => ({
      ...raw,
      externalId: `synthetic:duplicate:${index}`,
      rawPayload: {
        ...raw.rawPayload,
        duplicateIndex: index,
      },
    }));
  }
  if (scenario === "price-move") {
    return [{
      ...baseNews(now),
      externalId: `synthetic:price-move:${now}`,
      summary: "Synthetic catalyst aligned to a public Polymarket price reaction window.",
      rawPayload: {
        drill: true,
        source: "synthetic",
        scenario,
        observedAt: now,
      },
    }];
  }
  return [];
}

function healthForScenario(scenario: TerminalSyntheticScenarioName, now: string): DataSourceStatus[] {
  if (scenario === "source-outage") {
    return [
      dataSourceStatusFromRegistry(registry("gdelt-doc"), {
        health: "failing",
        lastAttemptAt: now,
        consecutiveFailures: 4,
        itemsFetchedLastRun: 0,
        itemsAcceptedLastRun: 0,
        lastError: "Synthetic outage drill: upstream timeout",
      }),
    ];
  }
  if (scenario === "rate-limit-incident") {
    return [
      dataSourceStatusFromRegistry(registry("gdelt-doc"), {
        health: "degraded",
        lastAttemptAt: now,
        lastHttpStatus: 429,
        rateLimitRemaining: 0,
        rateLimitResetAt: isoPlusMinutes(now, 5),
        consecutiveFailures: 1,
        itemsFetchedLastRun: 0,
        itemsAcceptedLastRun: 0,
        lastError: "Synthetic rate-limit drill: upstream 429",
      }),
    ];
  }
  return [
    dataSourceStatusFromRegistry(registry("federal-reserve-rss"), {
      health: "healthy",
      lastAttemptAt: now,
      lastSuccessAt: now,
      consecutiveFailures: 0,
      itemsFetchedLastRun: scenario === "duplicate-burst" ? 3 : 1,
      itemsAcceptedLastRun: 1,
    }),
  ];
}

function marketMovesForScenario(scenario: TerminalSyntheticScenarioName, now: string, marketId: string): MarketMove[] {
  if (scenario !== "price-move") return [];
  return [
    {
      id: deterministicPayloadId("synthetic-market-move", { marketId, now }),
      marketId,
      timestamp: now,
      windowMinutes: 15,
      probabilityBefore: 0.48,
      probabilityAfter: 0.61,
      volumeUsd: 125000,
      source: "polymarket-public",
    },
  ];
}

export function buildTerminalSyntheticScenario(
  input: TerminalSyntheticScenarioInput,
): TerminalSyntheticScenarioResult {
  const generatedAt = input.now ?? new Date().toISOString();
  const rawItems = rawNewsForScenario(input.scenario, generatedAt);
  const newsItems = dedupeNewsItems(rawItems.map((raw) => newsItemFromRaw(raw, generatedAt)));
  const eventClusters = clusterNewsItems(newsItems, { now: generatedAt });

  return {
    readOnly: true,
    scenario: input.scenario,
    generatedAt,
    rawItemsGenerated: rawItems.length,
    newsItems,
    eventClusters,
    sourceHealth: healthForScenario(input.scenario, generatedAt),
    marketMoves: marketMovesForScenario(input.scenario, generatedAt, input.marketId ?? "synthetic-market"),
  };
}
