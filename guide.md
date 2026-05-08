# Solvol Terminal Ingestion Bridge Guide

## Goal

Build a production-ready ingestion bridge for Solvol Terminal that is market-led, deterministic, provenance-first, and strictly read-only. The bridge must explain candidate Polymarket market moves from public market data, official/public source documents, normalized event clusters, score components, and timestamps.

Non-negotiables:

- Keep Solvol Terminal read-only. Do not add trade execution, order placement, custody, deposits, withdrawals, private-key handling, or brokerage/custody flows.
- Treat Polymarket public data as the authoritative market registry and price-reaction source.
- Preserve deterministic mock fallback so `/terminal` remains demoable without credentials or network access.
- Treat LLM output as optional narration only. Source truth must come from normalized data, source documents, scores, rule IDs, and timestamps.
- Use `src/lib/terminal/types.ts` for shared terminal domain contracts.
- Keep source adapters behind `MarketSource` or a compatible source boundary.
- Every why-moved explanation must be replayable from raw source payloads, normalized documents, clustering decisions, score components, and observed market movement.

## Architecture Principles

The bridge should be:

- Market-led: start from active Polymarket markets, not from an unbounded news firehose.
- Deterministic: default to explicit rules, stable fingerprints, pinned model versions, and inspectable scoring.
- Provenance-first: store immutable raw payload references, checksums, adapter versions, normalized documents, event membership, and score breakdowns.
- Source-aware: official/on-chain sources get higher base credibility; social and delayed commercial-news sources are useful but lower-trust.
- Replayable: raw documents can rebuild `NewsItem`, `EventItem`, and `WhyMovedCandidate` rows.
- Failure-tolerant: source failures degrade evidence density and health status, not the entire terminal.

## Recommended Stack

Start with the conservative stack already compatible with the Solvol codebase:

| Layer | Default |
| --- | --- |
| Runtime | TypeScript services in containers |
| Primary database | Postgres |
| Time-series | Timescale hypertables for prices, source metrics, and event logs |
| Queue | `pg-boss` first; Redis Streams or BullMQ if workload shape requires it |
| Cache/pub-sub | Redis |
| Raw payload storage | S3-compatible object storage or local emulator for dev |
| Search | Postgres full-text first |
| Realtime gateway | SSE or WebSocket service backed by outbox records |
| Observability | Structured logs, OpenTelemetry-compatible traces, source health metrics |
| Optional analytic sidecar | ClickHouse only if append-only volume outgrows Postgres query targets |

## Source Priority

Prioritize sources in this order:

1. Market state: Polymarket registry, live market data, price history, comments/streams where public.
2. Primary official feeds: SEC, Federal Reserve, FEMA/IPAWS, USGS, CISA, official RSS/Atom feeds.
3. High-recall open news: GDELT.
4. Crypto/on-chain context: Etherscan, Ethereum JSON-RPC logs, CoinGecko.
5. Social early warning: Reddit and Mastodon, with low base credibility and strict retention/ToS handling.
6. Fact-check overlays: FactCheck.org, Snopes, and similar sources for contradiction/downgrade, not primary live triggers.
7. Optional attention layers: Google Trends only if access is available.

| Priority | Source | URL | Use |
| --- | --- | --- | --- |
| A | Polymarket | `https://docs.polymarket.com` | `market_registry`, `market_state`, price history, price reaction windows, public links |
| A | GDELT | `https://api.gdeltproject.org/api/v2/doc/doc` | Broad global news recall, article metadata, themes, entities, tone hints |
| A | SEC EDGAR/RSS | `https://data.sec.gov`, `https://www.sec.gov/about/rss-feeds` | Filings, enforcement, ETF/corporate catalysts, structured primary evidence |
| A | Federal Reserve RSS | `https://www.federalreserve.gov/feeds/feeds.htm` | Macro/rates/statistics releases and official policy statements |
| A | FEMA/IPAWS | `https://www.fema.gov` | Official hazard and emergency alerts |
| A | USGS real-time feeds | `https://earthquake.usgs.gov/earthquakes/feed/` | Earthquakes and high-precision disaster signals |
| A | Etherscan | `https://docs.etherscan.io` | Indexed transfers, contract logs, token context, tx metadata |
| A | Ethereum JSON-RPC | `https://ethereum.org/developers/docs/apis/json-rpc/` | Raw replayable logs, blocks, contract events |
| A | CoinGecko | `https://docs.coingecko.com` | Crypto market context and trend confirmation |
| B | GNews | `https://docs.gnews.io` | Secondary normalized news backfill/enrichment; free tier is delayed |
| B | mediastack | `https://mediastack.com/documentation` | Low-rate secondary enrichment; free tier is tight and delayed |
| B | Reddit Data API | `https://www.reddit.com/dev/api/` | Social discussion spikes, rumors, early chatter with strict policy handling |
| B | Mastodon API | `https://docs.joinmastodon.org/methods/timelines/` | Federated public trend discovery where instance access permits |
| B | CISA | `https://www.cisa.gov/about/contact-us/subscribe-updates-cisa` | Cyber/infrastructure advisories and threat notices |
| B | Fact-check sources | `https://www.factcheck.org/advancedfeed/`, `https://www.snopes.com/latest/` | Contradiction and credibility overlays |
| C | Google Trends API | `https://developers.google.com/search/apis/trends` | Optional attention confirmation; alpha/access-limited |
| C | Pushshift | `https://pushshift.io/signup` | Do not use as a core dependency; current access is restricted |

Practical default: free official feeds and open data should drive live correlation before free commercial headline APIs. GNews and mediastack are useful for schemas/backfill, but their free plans are not good primary live sources.

## Domain Contracts

Keep these contracts in or aligned with `src/lib/terminal/types.ts`. If existing local types overlap, extend them conservatively instead of creating a second source of truth.

```ts
export type SourceClass =
  | "market"
  | "official"
  | "news_api"
  | "rss"
  | "social"
  | "onchain"
  | "factcheck";

export type HealthState = "healthy" | "degraded" | "failing" | "paused";
export type SentimentLabel = "positive" | "negative" | "neutral" | "mixed";
export type ConfidenceLabel = "low" | "medium" | "high";

export interface ProvenanceRef {
  sourceId: string;
  sourceClass: SourceClass;
  externalId: string;
  sourceUrl?: string;
  fetchedAt: string;
  publishedAt?: string;
  rawBlobKey: string;
  checksumSha256: string;
  adapterVersion: string;
}

export interface EntityRef {
  kind: "person" | "org" | "ticker" | "token" | "place" | "market_term" | "form";
  canonicalName: string;
  aliases: string[];
  confidence: number;
  sourceText?: string;
  externalIds?: Record<string, string>;
}

export interface GeoRef {
  name: string;
  countryCode?: string;
  admin1?: string;
  lat?: number;
  lon?: number;
  confidence: number;
  source: "explicit" | "structured" | "source-country" | "inferred";
}

export interface NewsItem {
  id: string;
  sourceId: string;
  externalId: string;
  sourceClass: SourceClass;
  headline: string;
  body?: string;
  summary?: string;
  canonicalUrl?: string;
  sourceUrl?: string;
  author?: string;
  publisherName?: string;
  publisherDomain?: string;
  language?: string;
  countryCode?: string;
  publishedAt?: string;
  observedAt: string;
  occurredAt?: string;
  categories?: string[];
  topics?: string[];
  entities?: EntityRef[];
  geo?: GeoRef[];
  sentiment?: {
    label: SentimentLabel;
    score: number;
    ruleIds: string[];
  };
  credibility?: {
    score: number;
    label: ConfidenceLabel;
    reasons: string[];
  };
  dedupeFingerprint: string;
  provenance: ProvenanceRef[];
}

export interface EventItem {
  id: string;
  clusterKey: string;
  kind:
    | "breaking_news"
    | "official_filing"
    | "official_statement"
    | "macro_release"
    | "onchain_activity"
    | "social_rumor"
    | "factcheck";
  title: string;
  abstract: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurredAt?: string;
  timePrecision: "minute" | "hour" | "day" | "unknown";
  sourceCount: number;
  sourceMix: SourceClass[];
  primaryEntityRefs: EntityRef[];
  geo?: GeoRef[];
  topics: string[];
  sentiment: {
    label: SentimentLabel;
    score: number;
    ruleIds: string[];
  };
  credibility: {
    score: number;
    label: ConfidenceLabel;
    reasons: string[];
  };
  representativeNewsItemId: string;
  memberNewsItemIds: string[];
  provenance: ProvenanceRef[];
}

export interface WhyMovedCandidate {
  id: string;
  marketId: string;
  marketSlug: string;
  eventId: string;
  moveId: string;
  direction: "yes" | "no" | "unclear";
  evidenceStatus: "supported" | "insufficient_evidence" | "contradicted" | "divergent_market";
  confidence: number;
  scoreBreakdown: {
    lexical: number;
    entity: number;
    time: number;
    source: number;
    corroboration: number;
    marketReaction: number;
    penalties: number;
  };
  moveQuality: {
    label: "weak" | "medium" | "strong";
    score: number;
    components: {
      magnitude: number;
      volume: number;
      timing: number;
      directionClarity: number;
    };
    ruleIds: string[];
  };
  marketDivergence: {
    detected: boolean;
    expectedDirection: "yes" | "no" | "unclear";
    observedDirection: "yes" | "no" | "unclear";
    reason?: string;
    ruleIds: string[];
  };
  observedPriceMove?: {
    from: number;
    to: number;
    absChange: number;
    windowStart: string;
    windowEnd: string;
  };
  reasons: string[];
  supportingNewsItemIds: string[];
  conflictingNewsItemIds?: string[];
  createdAt: string;
}

export interface DataSourceStatus {
  sourceId: string;
  sourceClass: SourceClass;
  health: HealthState;
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  lagSeconds?: number;
  lastCursor?: string;
  lastHttpStatus?: number;
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;
  consecutiveFailures: number;
  itemsFetchedLastRun?: number;
  itemsAcceptedLastRun?: number;
  backlogApprox?: number;
  lastError?: string;
}

export interface FetchCursor {
  after?: string;
  page?: number;
  sinceIso?: string;
  blockNumber?: number;
  etag?: string;
  lastModified?: string;
}

export interface FetchBatch<R> {
  cursor?: FetchCursor;
  nextCursor?: FetchCursor;
  rawItems: R[];
  sourceStatus: Partial<DataSourceStatus>;
}

export interface SourceAdapter<R> {
  readonly sourceId: string;
  readonly sourceClass: SourceClass;
  fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<R>>;
  normalize(raw: R): Promise<NewsItem[]>;
  buildExternalId(raw: R): string;
  buildIdempotencyKey(raw: R): string;
  healthCheck(): Promise<DataSourceStatus>;
}
```

Implementation rules:

- `normalize()` must be pure and deterministic.
- Raw payloads must never be mutated once stored.
- `EventItem` must be reconstructable from member `NewsItem` records.
- `EventItem.id` and `clusterKey` must be derived from sorted member evidence so replay is stable under source item reordering.
- Market status and event lifecycle changes must go through deterministic transition helpers that reject invalid terminal-state regressions with auditable rule IDs.
- Market-family classification must be reusable outside why-moved scoring and must emit deterministic family labels, matched terms, confidence, and rule IDs.
- `WhyMovedCandidate` must never contain unverifiable rationale without rule IDs and linked evidence rows.
- Preserve raw source timestamps and normalized UTC timestamps.

## Pipeline

```mermaid
flowchart LR
    A["Source adapters: Polymarket, official feeds, RSS, news APIs, social, on-chain"]
    B["Fetch scheduler: polling, streaming, reconciliation"]
    C["Ingress queue: pg-boss or Redis Streams"]
    D["Immutable raw store: blob payloads and checksums"]
    E["Normalizer: source raw to NewsItem"]
    F["Enrichment: entities, time, geo, sentiment, credibility"]
    G["Dedupe and clustering: NewsItem to EventItem"]
    H["Scoring: novelty, source quality, corroboration"]
    I["Polymarket linker: candidate markets and reaction windows"]
    J["Postgres and Timescale"]
    K["Outbox and realtime pub-sub"]
    L["SSE/WebSocket gateway"]
    M["Solvol UI and provenance panel"]
    N["Replay, DLQ, synthetic inject"]

    A --> B --> C --> D --> E --> F --> G --> H --> I --> J
    C --> N
    D --> N
    J --> K --> L --> M
    J --> M
```

Use streaming only where the source supports it reliably:

- Polymarket WebSockets and public market streams where available.
- Ethereum subscriptions when the configured node supports them.
- Polling for GDELT, SEC, RSS feeds, GNews, mediastack, Reddit, Mastodon, FEMA, USGS, CISA, and fact-check sources.
- Periodic reconciliation for Polymarket market metadata and price history.

Job model:

- Use small source-specific batches with explicit cursors.
- Persist cursors and conditional headers after every successful batch.
- For HTTP sources, store `etag`, `lastModified`, `sinceIso`, `after`, `page`, or equivalent cursor state.
- For chain sources, persist the latest fully committed block or block/timestamp checkpoint.
- Retry from the last committed cursor, not process memory.
- Use decorrelated exponential jitter and circuit breaking for 429/5xx failures.
- Source health must expose degraded/failing/paused states to the UI.

## Dedupe Strategy

Use staged dedupe instead of one duplicate flag:

| Stage | Deterministic key | Purpose |
| --- | --- | --- |
| Ingest idempotency | `sha256(sourceId + externalId)` or `sha256(sourceId + canonicalUrl + publishedAtBucket)` | Prevent repeat source inserts |
| Canonical URL dedupe | normalized URL with tracking params stripped | Collapse same article across UTM/AMP/mirrors |
| Headline/body fingerprint | normalized title plus first N chars of body | Catch syndication copies |
| Near-duplicate text | simhash/minhash | Catch rewrites and aggregator retellings |
| Event clustering | sorted member context/signatures, shared entities, place, time window, topic family | Convert many `NewsItem`s into one replay-stable `EventItem` |

Recommended idempotency key:

```ts
const key = sha256([
  sourceId,
  externalId || canonicalUrl || headlineFingerprint,
  publishedAt?.slice(0, 16) || observedAt.slice(0, 16),
].join("|"));
```

## Enrichment and Scoring

Keep sentiment separate from market-direction inference. Many markets are factual yes/no propositions, not good/bad sentiment markets.

Default enrichment sequence:

1. Normalize timestamps to UTC while preserving original values.
2. Extract entities using dictionaries and a pinned deterministic extractor.
3. Resolve organizations, tickers, token contracts, CIKs, places, and known market terms.
4. Derive geolocation from explicit coordinates or structured fields before source-country fallback.
5. Compute rule-based sentiment.
6. Compute credibility from source class, corroboration, structured evidence, and contradiction overlays.
7. Cluster into events.
8. Link events to candidate markets.
9. Score why-moved candidates with explicit components.

Starting sentiment rule:

```ts
function scoreSentiment(item: NewsItem): { label: SentimentLabel; score: number; ruleIds: string[] } {
  let score = 0;
  const rules: string[] = [];
  const text = `${item.headline} ${item.summary ?? ""} ${item.body ?? ""}`.toLowerCase();

  const positive = [/approved/, /wins?/, /passes?/, /raised guidance/, /beat(s|ing)? estimates/, /launch(ed)?/];
  const negative = [/denied/, /blocked/, /cuts? guidance/, /miss(es|ed)? estimates/, /hack(ed)?/, /investigation/, /lawsuit/, /default/, /delay(ed)?/];

  for (const rx of positive) if (rx.test(text)) { score += 0.2; rules.push(`sent_pos:${rx}`); }
  for (const rx of negative) if (rx.test(text)) { score -= 0.2; rules.push(`sent_neg:${rx}`); }

  if (item.sourceClass === "official") score *= 0.9;
  if (Math.abs(score) < 0.15) return { label: "neutral", score, ruleIds: rules };
  if (score > 0.15) return { label: "positive", score, ruleIds: rules };
  if (score < -0.15) return { label: "negative", score, ruleIds: rules };
  return { label: "mixed", score, ruleIds: rules };
}
```

Starting credibility rule:

```ts
function scoreCredibility(item: NewsItem, corroborationCount: number, contradictedByFactcheck: boolean) {
  let score =
    item.sourceClass === "market" ? 0.95 :
    item.sourceClass === "official" ? 0.95 :
    item.sourceClass === "onchain" ? 0.92 :
    item.sourceClass === "rss" ? 0.80 :
    item.sourceClass === "news_api" ? 0.65 :
    item.sourceClass === "factcheck" ? 0.90 :
    item.sourceClass === "social" ? 0.40 : 0.50;

  const reasons: string[] = [`base:${item.sourceClass}`];

  if (item.canonicalUrl) { score += 0.03; reasons.push("has_canonical_url"); }
  if (item.publisherDomain) { score += 0.02; reasons.push("has_publisher_domain"); }
  if (corroborationCount >= 2) { score += 0.08; reasons.push("corroborated_2plus"); }
  if (corroborationCount >= 4) { score += 0.05; reasons.push("corroborated_4plus"); }
  if (!item.body && item.sourceClass === "social") { score -= 0.05; reasons.push("social_sparse_content"); }
  if (contradictedByFactcheck) { score -= 0.25; reasons.push("contradicted_by_factcheck"); }

  score = Math.max(0, Math.min(1, score));
  const label: ConfidenceLabel = score >= 0.8 ? "high" : score >= 0.55 ? "medium" : "low";
  return { score, label, reasons };
}
```

Starting why-moved score:

```ts
function scoreWhyMoved(
  event: EventItem,
  market: { id: string; slug: string; question: string; category?: string },
  priceMoveAbs: number,
) {
  let lexical = 0, entity = 0, time = 0, source = 0, corroboration = 0, marketReaction = 0, penalties = 0;
  const reasons: string[] = [];

  const q = `${market.slug} ${market.question}`.toLowerCase();
  const title = `${event.title} ${event.abstract}`.toLowerCase();

  if (title.includes(market.slug.toLowerCase())) { lexical += 0.35; reasons.push("slug_hit"); }
  if (q.split(/\W+/).filter(Boolean).some((t) => title.includes(t))) {
    lexical += 0.15;
    reasons.push("question_token_overlap");
  }

  if (event.primaryEntityRefs.length > 0) {
    entity += Math.min(0.25, event.primaryEntityRefs.length * 0.05);
    reasons.push("entity_overlap");
  }

  if (event.occurredAt || event.firstSeenAt) { time += 0.15; reasons.push("time_window_match"); }

  if (event.credibility.score >= 0.85) { source += 0.20; reasons.push("high_credibility"); }
  else if (event.credibility.score >= 0.6) { source += 0.10; reasons.push("medium_credibility"); }

  if (event.sourceCount >= 2) { corroboration += 0.10; reasons.push("multi_source"); }
  if (event.sourceCount >= 4) { corroboration += 0.05; reasons.push("wide_confirmation"); }

  if (priceMoveAbs >= 0.03) { marketReaction += 0.10; reasons.push("3c_move"); }
  if (priceMoveAbs >= 0.07) { marketReaction += 0.10; reasons.push("7c_move"); }

  if (event.credibility.score < 0.5) { penalties += 0.15; reasons.push("low_credibility_penalty"); }
  if (event.kind === "social_rumor" && event.sourceCount < 2) {
    penalties += 0.10;
    reasons.push("rumor_penalty");
  }

  const confidence = Math.max(0, Math.min(1,
    lexical + entity + time + source + corroboration + marketReaction - penalties,
  ));

  return {
    confidence,
    reasons,
    scoreBreakdown: { lexical, entity, time, source, corroboration, marketReaction, penalties },
  };
}
```

Direction inference should use market-family rules:

- Approval/denial markets: `approved`, `blocked`, `denied`, `signed`, `certified`.
- Price threshold markets: extracted numeric value plus timestamp against market threshold/date.
- Election/nomination markets: certified results, withdrawals, ballot rulings, delegate counts, official announcements.
- Filing/enforcement markets: form type, accession, agency action, complaint filed, order issued.
- On-chain markets: contract events, bridge inflows/outflows, large transfers, governance execution.

## Polymarket Linker

Use two passes:

1. Deterministic candidate generation from market metadata: question, slug, category, dates, tags/search results, event slug, resolution source, and curated aliases.
2. Confidence scoring from lexical/entity overlap, source quality, corroboration, observed market reaction, and time-window proximity.

Candidate-generation recipe:

1. Refresh active market registry from public Polymarket metadata using keyset/paginated reads.
2. Build a lexical index over `question`, `slug`, `description`, `category`, `eventSlug`, and curated aliases.
3. When an `EventItem` lands, generate candidate markets by exact phrase hits, entity overlap, threshold/date overlap, topic compatibility, market recency, and activeness.
4. Compare event time to price movement windows only after candidate generation.
5. Store every candidate score component and reason.

Embeddings may be added later as optional rerankers, but they must not be required for the first production-ready path.

## Storage Model

Use Postgres as the canonical operational database. Add Timescale hypertables for append-heavy time-series rows.

| Table | Purpose | Important columns | Index strategy |
| --- | --- | --- | --- |
| `source_registry` | Source configuration | `source_id`, `class`, `enabled`, `priority`, `poll_interval_sec` | PK on `source_id` |
| `source_cursor` | Resumable cursor state | `source_id`, `cursor_json`, `etag`, `last_modified`, `last_success_at` | Unique on `source_id` |
| `raw_document` | Immutable raw payload metadata | `id`, `source_id`, `external_id`, `raw_blob_key`, `checksum_sha256`, `fetched_at`, `published_at` | Unique `(source_id, external_id)`; `fetched_at desc` |
| `news_item` | Normalized source document | `id`, `source_id`, `headline`, `canonical_url`, `publisher_domain`, `published_at`, `observed_at`, `credibility_score`, `dedupe_fingerprint`, `jsonb_payload` | Unique `id`; `published_at desc`; nullable unique `canonical_url`; GIN JSONB; full-text |
| `event_cluster` | Clustered event | `id`, `cluster_key`, `kind`, `title`, `occurred_at`, `first_seen_at`, `last_seen_at`, `credibility_score`, `source_count` | Unique `cluster_key`; `occurred_at desc`; GIN entities/topics |
| `event_cluster_member` | Event/news link | `event_id`, `news_item_id`, `is_primary` | PK `(event_id, news_item_id)` |
| `entity_catalog` | Resolved entities | `id`, `kind`, `canonical_name`, `aliases`, `external_ids` | GIN aliases; unique normalized name + kind |
| `market_registry` | Polymarket market metadata | `market_id`, `slug`, `question`, `category`, `resolution_source`, `start_date`, `end_date`, `status`, `liquidity`, `volume` | PK `market_id`; unique `slug`; full-text question/slug; `end_date` |
| `market_price` | Price series | `market_id`, `ts`, `price_yes`, `price_no`, `source` | Hypertable by `ts`; `(market_id, ts desc)` |
| `why_moved_candidate` | Event-to-market-move links | `id`, `market_id`, `event_id`, `move_id`, `confidence`, `direction`, `evidence_status`, `score_breakdown_json`, `move_quality_json`, `market_divergence_json`, `created_at` | Unique `(market_id, event_id, move_id)`; `(market_id, confidence desc, created_at desc)` |
| `delivery_outbox` | Realtime fanout | `seq`, `topic`, `payload_json`, `created_at`, `sent_at` | `(topic, seq)` |

Retention defaults:

- Raw blobs: hot for 30 to 90 days; cold for up to one year where terms allow.
- `news_item` and `event_cluster`: retain longer because they are compact and useful for audit/replay.
- `market_price`: retain detailed cadence for live explanation, then downsample.
- Reddit/social rows: support deletion/tombstones and policy-specific retention.

## Serving and Product Surface

Serving pattern:

1. Postgres remains the source of truth.
2. Every committed `event_cluster` or `why_moved_candidate` write emits an outbox record.
3. A publisher fans out to Redis/NATS.
4. SSE/WebSocket gateway pushes filtered updates to the UI.
5. REST endpoints serve history, market explain pages, source health, and provenance views.
6. Short-TTL caches protect hot endpoints.

Required UI surfaces:

- Source health: last success, lag, failures, rate limits, fetched vs accepted, degraded/paused state.
- Why-moved card: linked market, confidence, direction, event title, source badges, price move window, score components.
- Provenance panel: member source items, raw source links, timestamps, rule IDs, score components, contradictions/fact-check overlays.
- Replay/debug panel or internal endpoint: rebuild a candidate from raw IDs and show deterministic output.

## Security and Policy

- Keep all authenticated API keys server-only.
- Centralize source throttling.
- Never leak SEC, GNews, mediastack, Etherscan, CoinGecko, Reddit, or other credentials to the client.
- Keep SEC fetching backend-only and fair-access aware.
- Respect Reddit deletion/tombstone requirements.
- Do not rely on hidden scraping in the critical path.
- Do not let LLM output become authoritative evidence.

## Implementation Milestones

### Milestone 1: Contracts and Fixtures

- Extend `src/lib/terminal/types.ts` for source/provenance/news/event/why-moved contracts.
- Add zod or local validators for adapter payloads where useful.
- Add golden raw fixtures for initial Tier A adapters.
- Add unit tests proving exact normalization output.

### Milestone 2: Source Registry, Cursor, and Raw Store

- Add persistent source registry/cursor tables or local dev equivalents.
- Add immutable raw document metadata and checksum utilities.
- Add local object-store abstraction or file-backed dev fallback.
- Add idempotency-key and checksum tests.

### Milestone 3: Polymarket Registry and Price Reactions

- Reconcile public Polymarket markets/events into `market_registry`.
- Preserve verified event URLs and search fallback behavior already established in the app.
- Store price snapshots/history in `market_price`.
- Add reaction-window helpers and tests.

### Milestone 4: Tier A Source Adapters

Implement source adapters in this order:

1. GDELT.
2. SEC EDGAR/RSS.
3. Federal Reserve RSS.
4. USGS feeds.
5. FEMA/IPAWS or CISA official feeds.
6. Etherscan or JSON-RPC logs.
7. CoinGecko context.

Each adapter needs:

- Cursor support.
- Health check.
- Fixture tests.
- Pure deterministic `normalize()`.
- Idempotency key.
- Source-specific rate-limit budget.
- Mock fallback or synthetic fixture path for local demos.

### Milestone 5: Enrichment, Dedupe, and Clustering

- Add canonical URL normalization.
- Add headline/body fingerprints.
- Add near-duplicate similarity.
- Add simple entity resolution and alias dictionaries.
- Add deterministic sentiment and credibility scoring.
- Build `EventItem` clusters from `NewsItem` members.
- Add replay tests that rebuild clusters from fixture raw payloads.

### Milestone 6: Why-Moved Linker

- Build candidate generation from market metadata.
- Add market-family direction rules.
- Add price-reaction windows.
- Compute `WhyMovedCandidate` rows with score breakdowns.
- Add synthetic injection tests for market/event/price scenarios.
- Add precision-audit scaffolding for sampled candidates.

### Milestone 7: APIs, Realtime, and UI

- Add REST endpoints for latest why-moved candidates, market explain, source health, event detail, and provenance.
- Add durable outbox and SSE/WebSocket delivery.
- Add UI panels for source health and why-moved provenance.
- Preserve all existing mock/demo behavior and read-only boundaries.

### Milestone 8: Operations and Verification

- Add circuit breakers and source degradation.
- Add DLQ/replay jobs.
- Add metrics for source lag, normalization success, dedupe ratio, cluster purity sample, top-1/top-3 why-moved precision, official-source share, contradiction rate, and replay determinism.
- Run the required verification suite before claiming the foundation is ready:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `node --test --experimental-strip-types test/*.test.ts`
  - `npm run build`
- Update `SOLVOL_PLAN.md` with completed milestones, verification results, and blockers.

## Acceptance Criteria

The bridge is production-ready when:

- `/terminal` remains read-only and demoable without credentials.
- Polymarket registry and price reaction data come from public read-only sources.
- At least the first Tier A public/official sources normalize into auditable `NewsItem` rows.
- Raw payload metadata includes checksum, source, external ID, fetched timestamp, and adapter version.
- Event clusters can be replayed from normalized news members.
- Why-moved candidates include confidence, direction, score breakdown, supporting evidence IDs, and price move windows.
- Source health is visible and degraded sources do not break the terminal.
- Tests cover adapter fixtures, idempotency, dedupe, clustering, scoring, and mock fallback.
- The required repo verification commands pass.
- `SOLVOL_PLAN.md` documents what was implemented, what was verified, and what remains blocked.

## Codex CLI Goal Prompt

Copy this into Codex CLI from the Solvol repo root:

```text
/goal Build the production-ready Solvol Terminal ingestion bridge described in /Users/vvv/Documents/solvol/guide.md. Work in /Users/vvv/Documents/solvol. First read AGENTS.md, SOLVOL_PLAN.md, ARCHITECTURE.md, DATA_CONTRACTS.md, and guide.md. Keep Solvol Terminal strictly read-only: do not add trade execution, order placement, custody, deposits, withdrawals, private-key handling, or authenticated trading flows. Preserve deterministic mock fallback so /terminal remains demoable without credentials. Treat Polymarket public Gamma/CLOB/Data reads as the market registry and price-reaction source. Treat LLM output as optional narration only; source truth must come from normalized data, raw source payloads, provenance, scores, rule IDs, and timestamps. Implement the guide in conservative milestones: extend src/lib/terminal/types.ts for shared contracts, add source registry/cursor/raw-document/checksum foundations, add deterministic SourceAdapter/MarketSource-compatible adapters with fixture tests, reconcile public Polymarket markets and price history, normalize Tier A sources first, add dedupe/enrichment/event clustering, add why-moved candidate generation with explicit score breakdowns and market-family direction rules, add source health/provenance APIs and UI surfaces, and keep all new source adapters behind the terminal source boundary. Update SOLVOL_PLAN.md whenever a milestone changes, verification is run, or a blocker appears. Before claiming the product foundation is ready, run npm run lint, npx tsc --noEmit, node --test --experimental-strip-types test/*.test.ts, and npm run build. Final response must summarize files changed, verification results, remaining blockers, and any sources intentionally left mocked or disabled.
```
