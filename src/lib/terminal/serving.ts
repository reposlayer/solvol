import type {
  EventImpact,
  EventItem,
  EventItemKind,
  NewsItem,
  ProvenanceRef,
  SourceClass,
  WhyMovedCandidate,
  WhyMovedDirection,
  WhyMovedEvidenceStatus,
} from "./types";

export type TerminalServingConfig = {
  url: string;
  serviceKey: string;
};

export type TerminalServingRequest = (
  path: string,
  init: RequestInit & { headers: Record<string, string> },
) => Promise<unknown>;

export type TerminalEventsSnapshot = {
  readOnly: true;
  fetchedAt: string;
  mode: "durable" | "fallback";
  newsItems: NewsItem[];
  eventClusters: EventItem[];
  error?: string;
};

export type TerminalProvenanceSnapshot = {
  readOnly: true;
  fetchedAt: string;
  mode: "durable" | "fallback";
  event: EventItem | null;
  memberNewsItems: NewsItem[];
  provenance: ProvenanceRef[];
  error?: string;
};

export type TerminalWhyMovedSnapshot = {
  readOnly: true;
  fetchedAt: string;
  mode: "durable" | "fallback";
  whyMovedCandidates: WhyMovedCandidate[];
  error?: string;
};

type JsonRecord = Record<string, unknown>;

type EventClusterRow = JsonRecord & {
  id?: unknown;
  cluster_key?: unknown;
  kind?: unknown;
  title?: unknown;
  abstract?: unknown;
  occurred_at?: unknown;
  first_seen_at?: unknown;
  last_seen_at?: unknown;
  time_precision?: unknown;
  source_count?: unknown;
  source_mix?: unknown;
  primary_entities_json?: unknown;
  geo_json?: unknown;
  topics?: unknown;
  sentiment_json?: unknown;
  credibility_score?: unknown;
  credibility_json?: unknown;
  source_diversity_score?: unknown;
  novelty_score?: unknown;
  lifecycle_status?: unknown;
  rumor_status?: unknown;
  contradictions_json?: unknown;
  text_signature_json?: unknown;
  timeline_json?: unknown;
  representative_news_item_id?: unknown;
  provenance_json?: unknown;
};

type EventClusterMemberRow = {
  event_id?: unknown;
  news_item_id?: unknown;
};

type NewsItemRow = JsonRecord & {
  id?: unknown;
  jsonb_payload?: unknown;
};

type WhyMovedCandidateRow = JsonRecord & {
  id?: unknown;
  market_id?: unknown;
  market_slug?: unknown;
  event_id?: unknown;
  move_id?: unknown;
  direction?: unknown;
  evidence_status?: unknown;
  confidence?: unknown;
  event_market_link_json?: unknown;
  score_breakdown_json?: unknown;
  move_quality_json?: unknown;
  market_divergence_json?: unknown;
  observed_price_move_json?: unknown;
  reasons?: unknown;
  rule_ids?: unknown;
  supporting_news_item_ids?: unknown;
  conflicting_news_item_ids?: unknown;
  created_at?: unknown;
};

function cleanUrl(value: string): string {
  return value.replace(/\/$/, "");
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asArray<T>(value: unknown, guard: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(guard) : [];
}

function isSourceClass(value: unknown): value is SourceClass {
  return (
    value === "market" ||
    value === "official" ||
    value === "news_api" ||
    value === "rss" ||
    value === "social" ||
    value === "onchain" ||
    value === "factcheck"
  );
}

function isEventKind(value: unknown): value is EventItemKind {
  return (
    value === "news" ||
    value === "market_move" ||
    value === "wallet" ||
    value === "volatility" ||
    value === "resolution" ||
    value === "system" ||
    value === "breaking_news" ||
    value === "official_filing" ||
    value === "official_statement" ||
    value === "macro_release" ||
    value === "onchain_activity" ||
    value === "social_rumor" ||
    value === "factcheck"
  );
}

function isImpact(value: unknown): value is EventImpact {
  return value === "up" || value === "down" || value === "neutral";
}

function isDirection(value: unknown): value is WhyMovedDirection {
  return value === "yes" || value === "no" || value === "unclear";
}

function isEvidenceStatus(value: unknown): value is WhyMovedEvidenceStatus {
  return (
    value === "supported" ||
    value === "insufficient_evidence" ||
    value === "contradicted" ||
    value === "divergent_market"
  );
}

function isProvenanceRef(value: unknown): value is ProvenanceRef {
  const record = asRecord(value);
  return Boolean(
    record &&
    typeof record.sourceId === "string" &&
    isSourceClass(record.sourceClass) &&
    typeof record.externalId === "string" &&
    typeof record.fetchedAt === "string" &&
    typeof record.rawBlobKey === "string" &&
    typeof record.checksumSha256 === "string" &&
    typeof record.adapterVersion === "string",
  );
}

function isNewsItem(value: unknown): value is NewsItem {
  const record = asRecord(value);
  return Boolean(
    record &&
    typeof record.id === "string" &&
    typeof record.sourceId === "string" &&
    isSourceClass(record.sourceClass) &&
    typeof record.externalId === "string" &&
    typeof record.headline === "string" &&
    typeof record.observedAt === "string" &&
    Array.isArray(record.entities) &&
    asRecord(record.sentiment) &&
    asRecord(record.credibility) &&
    typeof record.dedupeFingerprint === "string" &&
    Array.isArray(record.provenance),
  );
}

function terminalServingConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): TerminalServingConfig | null {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;
  return {
    url: cleanUrl(url),
    serviceKey,
  };
}

export { terminalServingConfigFromEnv };

function servingHeaders(config: TerminalServingConfig): Record<string, string> {
  return {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
    "Content-Type": "application/json",
  };
}

async function defaultRequest(
  config: TerminalServingConfig,
  path: string,
  init: RequestInit & { headers: Record<string, string> },
): Promise<unknown> {
  const response = await fetch(`${cleanUrl(config.url)}${path}`, {
    ...init,
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Terminal serving request failed: ${response.status}`);
  }
  return response.json().catch(() => []);
}

async function readRows(
  config: TerminalServingConfig,
  request: TerminalServingRequest | undefined,
  path: string,
): Promise<unknown[]> {
  const read = request ?? ((reqPath, init) => defaultRequest(config, reqPath, init));
  const payload = await read(path, {
    method: "GET",
    headers: servingHeaders(config),
  });
  return Array.isArray(payload) ? payload : [];
}

function idsFilter(column: string, ids: string[]): string {
  return `${column}=in.(${ids.map(encodeURIComponent).join(",")})`;
}

function eventClusterPath(limit: number): string {
  const params = new URLSearchParams({
    select: "*",
    order: "last_seen_at.desc",
    limit: String(Math.min(Math.max(Math.trunc(limit), 1), 100)),
  });
  return `/rest/v1/event_cluster?${params.toString()}`;
}

function eventClusterByIdPath(eventId: string): string {
  const params = new URLSearchParams({
    select: "*",
    id: `eq.${eventId}`,
    limit: "1",
  });
  return `/rest/v1/event_cluster?${params.toString()}`;
}

function eventClusterMemberPath(eventIds: string[]): string {
  const params = new URLSearchParams({
    select: "event_id,news_item_id",
    order: "event_id.asc",
  });
  return `/rest/v1/event_cluster_member?${idsFilter("event_id", eventIds)}&${params.toString()}`;
}

function newsItemsPath(newsItemIds: string[]): string {
  const params = new URLSearchParams({
    select: "id,jsonb_payload",
  });
  return `/rest/v1/news_item?${idsFilter("id", newsItemIds)}&${params.toString()}`;
}

function whyMovedPath(input: { marketId?: string; limit: number }): string {
  const params = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(Math.min(Math.max(Math.trunc(input.limit), 1), 100)),
  });
  if (input.marketId) params.set("market_id", `eq.${input.marketId}`);
  return `/rest/v1/why_moved_candidate?${params.toString()}`;
}

function rowToEventItem(row: EventClusterRow, members: string[] = []): EventItem | null {
  const id = asString(row.id);
  const title = asString(row.title);
  if (!id || !title) return null;
  const provenance = asArray(row.provenance_json, isProvenanceRef);
  const firstProvenance = provenance[0];
  const occurredAt = asString(row.occurred_at) ?? asString(row.first_seen_at) ?? new Date(0).toISOString();
  const sourceCount = asNumber(row.source_count) ?? Math.max(1, provenance.length);
  const credibilityScore = asNumber(row.credibility_score);
  const credibilityRecord = asRecord(row.credibility_json);

  return {
    id,
    marketId: null,
    timestamp: occurredAt,
    kind: isEventKind(row.kind) ? row.kind : "news",
    title,
    summary: asString(row.abstract) ?? title,
    source: {
      id: firstProvenance?.sourceId ?? "durable-bridge",
      label: firstProvenance?.sourceId ?? "Durable Bridge",
      kind: "external",
    },
    impact: isImpact(row.impact) ? row.impact : "neutral",
    importance: Math.round((credibilityScore ?? 0.5) * 100),
    clusterKey: asString(row.cluster_key) ?? id,
    abstract: asString(row.abstract),
    firstSeenAt: asString(row.first_seen_at),
    lastSeenAt: asString(row.last_seen_at),
    occurredAt,
    timePrecision: row.time_precision === "minute" || row.time_precision === "hour" || row.time_precision === "day"
      ? row.time_precision
      : "unknown",
    sourceCount,
    sourceMix: asArray(row.source_mix, isSourceClass),
    primaryEntityRefs: Array.isArray(row.primary_entities_json) ? row.primary_entities_json as EventItem["primaryEntityRefs"] : [],
    geo: Array.isArray(row.geo_json) ? row.geo_json as EventItem["geo"] : [],
    topics: asStringArray(row.topics),
    sentiment: asRecord(row.sentiment_json) as EventItem["sentiment"],
    credibility: {
      label: credibilityRecord?.label === "low" || credibilityRecord?.label === "medium" || credibilityRecord?.label === "high"
        ? credibilityRecord.label
        : "medium",
      score: asNumber(credibilityRecord?.score) ?? credibilityScore ?? 0.5,
      ruleIds: asStringArray(credibilityRecord?.ruleIds),
      reasons: asStringArray(credibilityRecord?.reasons),
    },
    sourceDiversityScore: asNumber(row.source_diversity_score),
    noveltyScore: asNumber(row.novelty_score),
    lifecycleStatus: row.lifecycle_status === "new" ||
      row.lifecycle_status === "developing" ||
      row.lifecycle_status === "corroborated" ||
      row.lifecycle_status === "contested" ||
      row.lifecycle_status === "refuted"
      ? row.lifecycle_status
      : "new",
    rumorStatus: row.rumor_status === "not_rumor" ||
      row.rumor_status === "unverified" ||
      row.rumor_status === "corroborated" ||
      row.rumor_status === "contested" ||
      row.rumor_status === "refuted"
      ? row.rumor_status
      : "not_rumor",
    contradictions: Array.isArray(row.contradictions_json) ? row.contradictions_json as EventItem["contradictions"] : [],
    textSignature: asRecord(row.text_signature_json) as EventItem["textSignature"],
    timeline: Array.isArray(row.timeline_json) ? row.timeline_json as EventItem["timeline"] : [],
    representativeNewsItemId: asString(row.representative_news_item_id),
    memberNewsItemIds: members,
    provenance,
  };
}

function rowToNewsItem(row: NewsItemRow): NewsItem | null {
  if (isNewsItem(row.jsonb_payload)) return row.jsonb_payload;
  return null;
}

function memberRowsByEvent(rows: unknown[]): Map<string, string[]> {
  const byEvent = new Map<string, string[]>();
  for (const row of rows) {
    const record = asRecord(row) as EventClusterMemberRow | null;
    const eventId = asString(record?.event_id);
    const newsItemId = asString(record?.news_item_id);
    if (!eventId || !newsItemId) continue;
    byEvent.set(eventId, [...(byEvent.get(eventId) ?? []), newsItemId]);
  }
  return byEvent;
}

function rowToWhyMovedCandidate(row: WhyMovedCandidateRow): WhyMovedCandidate | null {
  const id = asString(row.id);
  const marketId = asString(row.market_id);
  const eventId = asString(row.event_id);
  const moveId = asString(row.move_id);
  if (!id || !marketId || !eventId || !moveId) return null;
  return {
    id,
    marketId,
    marketSlug: asString(row.market_slug) ?? marketId,
    eventId,
    moveId,
    eventMarketLink: (asRecord(row.event_market_link_json) as WhyMovedCandidate["eventMarketLink"] | null) ?? {
      eventId,
      marketId,
      status: "weak",
      score: 0,
      components: {
        explicitMarket: 0,
        lexical: 0,
        entity: 0,
        topic: 0,
        penalties: 0,
      },
      reasons: ["event_market_link_not_persisted"],
      ruleIds: ["why:link:missing"],
    },
    direction: isDirection(row.direction) ? row.direction : "unclear",
    evidenceStatus: isEvidenceStatus(row.evidence_status) ? row.evidence_status : "insufficient_evidence",
    confidence: asNumber(row.confidence) ?? 0,
    scoreBreakdown: asRecord(row.score_breakdown_json) as WhyMovedCandidate["scoreBreakdown"],
    moveQuality: asRecord(row.move_quality_json) as WhyMovedCandidate["moveQuality"],
    marketDivergence: asRecord(row.market_divergence_json) as WhyMovedCandidate["marketDivergence"],
    observedPriceMove: asRecord(row.observed_price_move_json) as WhyMovedCandidate["observedPriceMove"],
    reasons: asStringArray(row.reasons),
    ruleIds: asStringArray(row.rule_ids),
    supportingNewsItemIds: asStringArray(row.supporting_news_item_ids),
    conflictingNewsItemIds: asStringArray(row.conflicting_news_item_ids),
    createdAt: asString(row.created_at) ?? new Date(0).toISOString(),
  };
}

export async function fetchTerminalEventsSnapshot(opts: {
  now?: string;
  limit?: number;
  config?: TerminalServingConfig | null;
  request?: TerminalServingRequest;
} = {}): Promise<TerminalEventsSnapshot> {
  const fetchedAt = opts.now ?? new Date().toISOString();
  const config = opts.config === undefined ? terminalServingConfigFromEnv() : opts.config;
  if (!config) return { readOnly: true, fetchedAt, mode: "fallback", newsItems: [], eventClusters: [] };

  try {
    const eventRows = await readRows(config, opts.request, eventClusterPath(opts.limit ?? 25));
    const eventIds = eventRows.flatMap((row) => asString(asRecord(row)?.id) ?? []);
    const memberRows = eventIds.length
      ? await readRows(config, opts.request, eventClusterMemberPath(eventIds))
      : [];
    const members = memberRowsByEvent(memberRows);
    const newsItemIds = Array.from(new Set([...members.values()].flat()));
    const newsRows = newsItemIds.length ? await readRows(config, opts.request, newsItemsPath(newsItemIds)) : [];
    const newsItems = newsRows.map((row) => rowToNewsItem(row as NewsItemRow)).filter((item): item is NewsItem => Boolean(item));
    const eventClusters = eventRows
      .map((row) => {
        const eventId = asString(asRecord(row)?.id);
        return rowToEventItem(row as EventClusterRow, eventId ? members.get(eventId) ?? [] : []);
      })
      .filter((event): event is EventItem => Boolean(event));

    return { readOnly: true, fetchedAt, mode: "durable", newsItems, eventClusters };
  } catch (error) {
    return {
      readOnly: true,
      fetchedAt,
      mode: "fallback",
      newsItems: [],
      eventClusters: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchTerminalProvenanceSnapshot(opts: {
  eventId: string;
  now?: string;
  config?: TerminalServingConfig | null;
  request?: TerminalServingRequest;
}): Promise<TerminalProvenanceSnapshot> {
  const fetchedAt = opts.now ?? new Date().toISOString();
  const config = opts.config === undefined ? terminalServingConfigFromEnv() : opts.config;
  if (!config) {
    return { readOnly: true, fetchedAt, mode: "fallback", event: null, memberNewsItems: [], provenance: [] };
  }

  try {
    const [eventRow] = await readRows(config, opts.request, eventClusterByIdPath(opts.eventId));
    if (!eventRow) {
      return { readOnly: true, fetchedAt, mode: "durable", event: null, memberNewsItems: [], provenance: [] };
    }
    const memberRows = await readRows(config, opts.request, eventClusterMemberPath([opts.eventId]));
    const memberIds = memberRowsByEvent(memberRows).get(opts.eventId) ?? [];
    const newsRows = memberIds.length ? await readRows(config, opts.request, newsItemsPath(memberIds)) : [];
    const memberNewsItems = newsRows
      .map((row) => rowToNewsItem(row as NewsItemRow))
      .filter((item): item is NewsItem => Boolean(item));
    const event = rowToEventItem(eventRow as EventClusterRow, memberIds);

    return {
      readOnly: true,
      fetchedAt,
      mode: "durable",
      event,
      memberNewsItems,
      provenance: event?.provenance ?? memberNewsItems.flatMap((item) => item.provenance),
    };
  } catch (error) {
    return {
      readOnly: true,
      fetchedAt,
      mode: "fallback",
      event: null,
      memberNewsItems: [],
      provenance: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchTerminalWhyMovedSnapshot(opts: {
  marketId?: string;
  now?: string;
  limit?: number;
  config?: TerminalServingConfig | null;
  request?: TerminalServingRequest;
} = {}): Promise<TerminalWhyMovedSnapshot> {
  const fetchedAt = opts.now ?? new Date().toISOString();
  const config = opts.config === undefined ? terminalServingConfigFromEnv() : opts.config;
  if (!config) return { readOnly: true, fetchedAt, mode: "fallback", whyMovedCandidates: [] };

  try {
    const rows = await readRows(config, opts.request, whyMovedPath({
      marketId: opts.marketId,
      limit: opts.limit ?? 25,
    }));
    return {
      readOnly: true,
      fetchedAt,
      mode: "durable",
      whyMovedCandidates: rows
        .map((row) => rowToWhyMovedCandidate(row as WhyMovedCandidateRow))
        .filter((candidate): candidate is WhyMovedCandidate => Boolean(candidate)),
    };
  } catch (error) {
    return {
      readOnly: true,
      fetchedAt,
      mode: "fallback",
      whyMovedCandidates: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
