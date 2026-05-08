import type {
  DataSourceStatus,
  EventItem,
  NewsItem,
  RawDocument,
  SourceRegistryEntry,
  WhyMovedCandidate,
} from "./types";
import type {
  MarketPriceRecord,
  MarketRegistryRecord,
} from "./market-registry";
import { sha256Hex } from "./source-registry.ts";

type JsonRecord = Record<string, unknown>;

export type IngestionBridgeArtifacts = {
  registry: SourceRegistryEntry[];
  sourceHealth?: DataSourceStatus[];
  rawDocuments?: RawDocument[];
  newsItems: NewsItem[];
  eventClusters: EventItem[];
  markets: MarketRegistryRecord[];
  priceRecords: MarketPriceRecord[];
  whyMovedCandidates: WhyMovedCandidate[];
  now?: string;
};

export type IngestionBridgePersistenceRows = {
  sourceRegistry: JsonRecord[];
  sourceCursor: JsonRecord[];
  rawDocument: JsonRecord[];
  newsItem: JsonRecord[];
  eventCluster: JsonRecord[];
  eventClusterMember: JsonRecord[];
  marketRegistry: JsonRecord[];
  marketPrice: JsonRecord[];
  whyMovedCandidate: JsonRecord[];
  deliveryOutbox: JsonRecord[];
};

type RestRequest = (
  path: string,
  init: RequestInit & { prefer?: string },
) => Promise<unknown>;

type SupabaseBridgeConfig = {
  url: string;
  serviceKey: string;
};

export type PersistIngestionBridgeOptions = {
  configured?: boolean;
  request?: RestRequest;
};

export type PersistIngestionBridgeResult = {
  persisted: boolean;
  skippedReason?: string;
  rows: Record<keyof IngestionBridgePersistenceRows, number>;
};

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) sp.set(key, String(value));
  }
  return sp.toString();
}

function getBridgeSupabaseConfig(): SupabaseBridgeConfig | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function parseCursor(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return { value };
  }
}

function rawDocumentsFromNews(newsItems: NewsItem[]): RawDocument[] {
  const byId = new Map<string, RawDocument>();
  for (const item of newsItems) {
    for (const provenance of item.provenance) {
      const id = sha256Hex(`${provenance.sourceId}|${provenance.externalId}|${provenance.checksumSha256}`);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        sourceId: provenance.sourceId,
        sourceClass: provenance.sourceClass,
        externalId: provenance.externalId,
        rawBlobKey: provenance.rawBlobKey,
        checksumSha256: provenance.checksumSha256,
        fetchedAt: provenance.fetchedAt,
        publishedAt: provenance.publishedAt,
        adapterVersion: provenance.adapterVersion,
        byteLength: 0,
      });
    }
  }
  return [...byId.values()];
}

function sourceRegistryRow(entry: SourceRegistryEntry): JsonRecord {
  return {
    source_id: entry.sourceId,
    source_class: entry.sourceClass,
    label: entry.label,
    enabled: entry.enabled,
    read_only: true,
    priority: entry.priority,
    poll_interval_sec: entry.pollIntervalSec,
    adapter_version: entry.adapterVersion,
    base_url: entry.baseUrl ?? null,
    rate_limit_per_minute: entry.rateLimitPerMinute ?? null,
    metadata: {},
  };
}

function sourceCursorRow(status: DataSourceStatus): JsonRecord {
  const row: JsonRecord = {
    source_id: status.sourceId,
    etag: null,
    last_modified: null,
    last_success_at: status.lastSuccessAt ?? null,
    last_attempt_at: status.lastAttemptAt ?? null,
    last_http_status: status.lastHttpStatus ?? null,
    rate_limit_remaining: status.rateLimitRemaining ?? null,
    rate_limit_reset_at: status.rateLimitResetAt ?? null,
    consecutive_failures: status.consecutiveFailures,
    items_fetched_last_run: status.itemsFetchedLastRun ?? null,
    items_accepted_last_run: status.itemsAcceptedLastRun ?? null,
    last_error: status.lastError ?? null,
    updated_at: status.lastAttemptAt ?? status.lastSuccessAt ?? new Date().toISOString(),
  };
  if (status.lastCursor !== undefined) {
    row.cursor_json = parseCursor(status.lastCursor);
  }
  return row;
}

function rawDocumentRow(document: RawDocument): JsonRecord {
  return {
    id: document.id,
    source_id: document.sourceId,
    source_class: document.sourceClass,
    external_id: document.externalId,
    raw_blob_key: document.rawBlobKey,
    checksum_sha256: document.checksumSha256,
    fetched_at: document.fetchedAt,
    published_at: document.publishedAt ?? null,
    adapter_version: document.adapterVersion,
    byte_length: document.byteLength,
    metadata: {},
  };
}

function newsItemRow(item: NewsItem): JsonRecord {
  return {
    id: item.id,
    source_id: item.sourceId,
    source_class: item.sourceClass,
    external_id: item.externalId,
    headline: item.headline,
    body: item.body ?? null,
    summary: item.summary ?? null,
    canonical_url: item.canonicalUrl ?? null,
    source_url: item.sourceUrl ?? null,
    author: item.author ?? null,
    publisher_name: item.publisherName ?? null,
    publisher_domain: item.publisherDomain ?? null,
    language: item.language ?? null,
    country_code: item.countryCode ?? null,
    published_at: item.publishedAt ?? null,
    observed_at: item.observedAt,
    occurred_at: item.occurredAt ?? null,
    categories: item.categories ?? [],
    topics: item.topics ?? [],
    entities_json: item.entities,
    geo_json: item.geo ?? [],
    sentiment_json: item.sentiment,
    credibility_json: item.credibility,
    dedupe_fingerprint: item.dedupeFingerprint,
    provenance_json: item.provenance,
    jsonb_payload: item,
  };
}

function eventClusterRow(event: EventItem): JsonRecord {
  return {
    id: event.id,
    cluster_key: event.clusterKey ?? event.id,
    kind: event.kind,
    title: event.title,
    abstract: event.abstract ?? event.summary,
    occurred_at: event.occurredAt ?? event.timestamp,
    first_seen_at: event.firstSeenAt ?? event.timestamp,
    last_seen_at: event.lastSeenAt ?? event.timestamp,
    time_precision: event.timePrecision ?? "unknown",
    source_count: event.sourceCount ?? 1,
    source_mix: event.sourceMix ?? [],
    primary_entities_json: event.primaryEntityRefs ?? [],
    geo_json: event.geo ?? [],
    topics: event.topics ?? [],
    sentiment_json: event.sentiment ?? {},
    credibility_score: event.credibility?.score ?? event.importance / 100,
    credibility_json: event.credibility ?? {},
    source_diversity_score: event.sourceDiversityScore ?? 0,
    novelty_score: event.noveltyScore ?? 0,
    lifecycle_status: event.lifecycleStatus ?? "new",
    rumor_status: event.rumorStatus ?? "not_rumor",
    contradictions_json: event.contradictions ?? [],
    text_signature_json: event.textSignature ?? {},
    timeline_json: event.timeline ?? [],
    representative_news_item_id: event.representativeNewsItemId ?? null,
    provenance_json: event.provenance ?? [],
  };
}

function eventClusterMemberRows(event: EventItem): JsonRecord[] {
  return (event.memberNewsItemIds ?? []).map((newsItemId) => ({
    event_id: event.id,
    news_item_id: newsItemId,
    is_primary: newsItemId === event.representativeNewsItemId,
  }));
}

function marketRegistryRow(market: MarketRegistryRecord): JsonRecord {
  return {
    market_id: market.marketId,
    slug: market.slug,
    event_slug: market.eventSlug,
    question: market.question,
    category: market.category,
    entities_json: market.entityRefs,
    resolution_source: market.resolutionSource,
    start_date: market.startDate,
    end_date: market.endDate,
    status: market.status,
    liquidity: market.liquidity,
    volume: market.volume,
    url: market.url,
    raw_payload: market,
    updated_at: market.updatedAt,
  };
}

function marketPriceRow(price: MarketPriceRecord): JsonRecord {
  return {
    market_id: price.marketId,
    ts: price.ts,
    price_yes: price.priceYes,
    price_no: price.priceNo,
    source: price.source,
    volume: price.volume ?? null,
  };
}

function whyMovedCandidateRow(candidate: WhyMovedCandidate): JsonRecord {
  return {
    id: candidate.id,
    market_id: candidate.marketId,
    event_id: candidate.eventId,
    move_id: candidate.moveId,
    direction: candidate.direction,
    evidence_status: candidate.evidenceStatus,
    confidence: candidate.confidence,
    event_market_link_json: candidate.eventMarketLink,
    score_breakdown_json: candidate.scoreBreakdown,
    move_quality_json: candidate.moveQuality,
    market_divergence_json: candidate.marketDivergence,
    observed_price_move_json: candidate.observedPriceMove ?? null,
    reasons: candidate.reasons,
    rule_ids: candidate.ruleIds,
    supporting_news_item_ids: candidate.supportingNewsItemIds,
    conflicting_news_item_ids: candidate.conflictingNewsItemIds ?? [],
    created_at: candidate.createdAt,
  };
}

export function buildIngestionBridgePersistenceRows(
  artifacts: IngestionBridgeArtifacts,
): IngestionBridgePersistenceRows {
  const now = artifacts.now ?? new Date().toISOString();
  const rawDocuments = artifacts.rawDocuments ?? rawDocumentsFromNews(artifacts.newsItems);
  const eventClusterRows = artifacts.eventClusters.map(eventClusterRow);
  const candidateRows = artifacts.whyMovedCandidates.map(whyMovedCandidateRow);

  return {
    sourceRegistry: artifacts.registry.map(sourceRegistryRow),
    sourceCursor: (artifacts.sourceHealth ?? []).map(sourceCursorRow),
    rawDocument: rawDocuments.map(rawDocumentRow),
    newsItem: artifacts.newsItems.map(newsItemRow),
    eventCluster: eventClusterRows,
    eventClusterMember: artifacts.eventClusters.flatMap(eventClusterMemberRows),
    marketRegistry: artifacts.markets.map(marketRegistryRow),
    marketPrice: artifacts.priceRecords.map(marketPriceRow),
    whyMovedCandidate: candidateRows,
    deliveryOutbox: [
      ...(artifacts.sourceHealth ?? []).map((status) => ({
        topic: "terminal.source_health",
        payload_json: status,
        created_at: status.lastAttemptAt ?? status.lastSuccessAt ?? now,
      })),
      ...artifacts.eventClusters.map((event) => ({
        topic: "terminal.event_cluster",
        payload_json: event,
        created_at: now,
      })),
      ...artifacts.whyMovedCandidates.map((candidate) => ({
        topic: "terminal.why_moved_candidate",
        payload_json: candidate,
        created_at: candidate.createdAt,
      })),
    ],
  };
}

async function defaultRequest(
  path: string,
  init: RequestInit & { prefer?: string },
): Promise<unknown> {
  const cfg = getBridgeSupabaseConfig();
  if (!cfg) throw new Error("Supabase is not configured");
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Supabase bridge persist failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

async function postRows(
  request: RestRequest,
  table: string,
  rows: JsonRecord[],
  onConflict?: string,
): Promise<void> {
  if (rows.length === 0) return;
  const query = onConflict ? `?${qs({ on_conflict: onConflict })}` : "";
  await request(`/rest/v1/${table}${query}`, {
    method: "POST",
    prefer: onConflict ? "resolution=merge-duplicates" : undefined,
    body: JSON.stringify(rows),
  });
}

function rowCounts(rows: IngestionBridgePersistenceRows): Record<keyof IngestionBridgePersistenceRows, number> {
  return {
    sourceRegistry: rows.sourceRegistry.length,
    sourceCursor: rows.sourceCursor.length,
    rawDocument: rows.rawDocument.length,
    newsItem: rows.newsItem.length,
    eventCluster: rows.eventCluster.length,
    eventClusterMember: rows.eventClusterMember.length,
    marketRegistry: rows.marketRegistry.length,
    marketPrice: rows.marketPrice.length,
    whyMovedCandidate: rows.whyMovedCandidate.length,
    deliveryOutbox: rows.deliveryOutbox.length,
  };
}

export async function persistIngestionBridgeArtifacts(
  artifacts: IngestionBridgeArtifacts,
  opts: PersistIngestionBridgeOptions = {},
): Promise<PersistIngestionBridgeResult> {
  const rows = buildIngestionBridgePersistenceRows(artifacts);
  const configured = opts.configured ?? getBridgeSupabaseConfig() !== null;
  if (!configured) {
    return {
      persisted: false,
      skippedReason: "Supabase is not configured",
      rows: rowCounts(rows),
    };
  }

  const request = opts.request ?? defaultRequest;
  await postRows(request, "source_registry", rows.sourceRegistry, "source_id");
  await postRows(request, "source_cursor", rows.sourceCursor, "source_id");
  await postRows(request, "raw_document", rows.rawDocument, "source_id,external_id");
  await postRows(request, "news_item", rows.newsItem, "source_id,external_id");
  await postRows(request, "event_cluster", rows.eventCluster, "cluster_key");
  await postRows(request, "event_cluster_member", rows.eventClusterMember, "event_id,news_item_id");
  await postRows(request, "market_registry", rows.marketRegistry, "market_id");
  await postRows(request, "market_price", rows.marketPrice, "market_id,ts,source");
  await postRows(request, "why_moved_candidate", rows.whyMovedCandidate, "market_id,event_id,move_id");
  await postRows(request, "delivery_outbox", rows.deliveryOutbox);

  return {
    persisted: true,
    rows: rowCounts(rows),
  };
}
