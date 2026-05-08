# Solvol Terminal Data Contracts

Shared terminal contracts live in `src/lib/terminal/types.ts`. These contracts are the source of truth for terminal data, not LLM output.

## MarketSource

`MarketSource` is the adapter boundary for all market reads.

Required methods:

- `listMarkets(query)`
- `getMarket(marketId)`
- `listMoves(marketId)`
- `listWalletActivity(query)`
- `listEvents(query)`
- `listAlertRules()`
- `listAlertEvents()`
- `status()`

Adapters:

- `PolymarketAdapter`: `createPolymarketMarketSource()` in `src/lib/terminal/polymarket-source.ts`
- `MockPolymarketAdapter`: `createMockMarketSource()` in `src/lib/terminal/mock-source.ts`

All adapters must remain read-only.

## Normalized Market Contracts

`Market` contains:

- `id`, `source`, `title`, `category`, `event`, `url`
- `description`, `resolutionRules`
- `outcomes`
- `probability`, `volume24h`, `volume7d`, `liquidity`, `openInterest`
- lifecycle timestamps and status
- `priceHistory`

`MarketOutcome` contains an outcome label, probability, and price. For Polymarket binary markets, YES/NO prices are treated as implied probabilities.

`MarketPricePoint` contains timestamped probability history plus optional volume.

## Movement And Flow

`MarketMove` records a probability move window:

- before/after probability
- timestamp
- window minutes
- volume
- source

`WalletActivity` records public wallet/trade flow:

- wallet/proxy address
- optional public label
- outcome, side, size, notional, price
- timestamp and source

`EventItem` records normalized source, market, system, resolution, volatility, wallet, or news events. Events always carry a source reference, timestamp, impact, and importance.

## Alerts

`AlertRule` supports:

- `probability_cross`
- `probability_jump`
- `volume_spike`
- `whale_activity`
- `watched_market`

`evaluateAlertRules()` in `src/lib/terminal/alerts.ts` evaluates local rules deterministically against normalized markets, moves, wallet activity, and watchlist IDs. It returns `AlertEvent` records with stable IDs, severity, timestamp, and read state.

## Scores

`src/lib/terminal/scoring.ts` implements:

- volatility score
- momentum score
- movement significance score
- unusual volume score
- whale conviction score
- market importance score
- deterministic why-moved correlation

Scores are bounded 0-100 and are intended for ranking and explanation, not trading advice.

## Why-Moved Correlation

`correlateMoveCauses()` links a `MarketMove` to nearby source events and wallet activity. It scores:

- time proximity to the move window
- event impact alignment
- wallet side/outcome alignment
- wallet notional conviction
- source type and importance

The output is `MoveCorrelation`, which contains ranked `MoveCorrelationMatch` records with reasons and timestamps.

## Timeline

`mergeTerminalTimeline()` in `src/lib/terminal/timeline.ts` combines:

- `EventItem`
- `MarketMove`
- `WalletActivity`
- `MoveCorrelation`

It returns reverse-time `TerminalTimelineEntry` records for the Event Timeline route and "why moved" panels.

## System Health

`MarketSourceStatus` records:

- adapter id and label
- mode: `real`, `mock`, or `hybrid`
- read-only flag
- health flag
- latency
- checked timestamp
- message

Live API routes include status where practical. Mock fallback status must explicitly say that deterministic demo data is active.

## Bridge Source Contracts

The ingestion bridge extends `src/lib/terminal/types.ts` with source-agnostic contracts:

- `SourceClass`: market, official, news API, RSS, social, on-chain, and fact-check classes.
- `ProvenanceRef`: immutable source reference with raw blob key, checksum, adapter version, source timestamps, and source URL.
- `NewsItem`: normalized source document with entities, geo, sentiment, credibility, dedupe fingerprint, and provenance.
- `EventItem`: deterministic event cluster output with source mix, member IDs, score labels, timestamps, provenance, replayable text signatures, an ordered member timeline, order-invariant cluster identity, source-diversity score, novelty score, lifecycle status, rumor status, and contradiction records.
- `MarketFamilyClassification`: deterministic market family label for approval, price-threshold, election, filing, enforcement, on-chain, weather, sports, and generic markets, with confidence, matched terms, and rule ID.
- `EventMarketLink`: deterministic event-to-market candidate link with explicit-market, lexical, entity, topic, penalty components, status, reasons, and rule IDs.
- `WhyMovedCandidate`: market-event-move correlation with the reaction `moveId`, event-market link, direction, evidence status, confidence, score breakdown, move-quality score, market-divergence metadata, evidence IDs, conflicting/contradictory evidence IDs, rule IDs, and observed price move window.
- `FetchCursor`, `FetchBatch`, and `SourceAdapter`: source polling, cursor, normalization, idempotency, and health-check boundary.

Event cluster lifecycle metadata is deterministic and replayable. `lifecycleStatus` can be `new`, `developing`, `corroborated`, `contested`, or `refuted`; `rumorStatus` can be `not_rumor`, `unverified`, `corroborated`, `contested`, or `refuted`. `contradictions` records identify the fact-check or opposing item, the contradicted member IDs, confidence, reason, and rule ID. `WhyMovedCandidate.conflictingNewsItemIds` carries those contradictory evidence IDs into the scored market explanation.

Market and event transitions are explicit contracts. `TerminalStateTransition<TState>`, `MarketStatusTransition`, and `EventLifecycleTransition` live in `src/lib/terminal/types.ts`; deterministic transition helpers live in `src/lib/terminal/state-machines.ts`. Invalid transitions return `accepted: false` records with stable `market_state:invalid:*` or `event_lifecycle:invalid:*` rule IDs rather than mutating state. `resolved` markets and `refuted` events are terminal states.

Market family classification is deterministic and reusable. `src/lib/terminal/market-family.ts` classifies market questions and resolution text before why-moved scoring, then maps event text plus fallback impact into family-specific direction rule IDs such as `why:market_family:approval` and `why:market_family:price_threshold`.

## Rollout And Canary Contracts

`src/lib/terminal/rollout.ts` exposes the read-only operator rollout contract. `TerminalBridgeRolloutPlan.readyForProductionCanary` is true only when staging shadow, staging active, and production canary gates are satisfied. `TerminalBridgeRolloutPlan.readyForGeneralRollout` is a separate public-rollout gate and remains false until the production canary window and no-P1/P2-defect approvals are set.

Why-moved evidence status is deterministic. `evidenceStatus` can be `supported`, `insufficient_evidence`, `contradicted`, or `divergent_market`. Weak confidence, weak price/volume/timing quality, or uncorroborated social-rumor support degrades to `insufficient_evidence`; contradiction/refutation metadata degrades to `contradicted`; and an observed market move that opposes the inferred event direction is marked `divergent_market`. `EventMarketLink` is computed before reaction-window scoring so unrelated high-credibility events in the same time window are filtered rather than turned into weak why-moved evidence. Durable `why_moved_candidate.event_market_link_json` stores the link score, components, reasons, and rule IDs that justified candidate generation. `moveId` preserves the exact reaction window that was scored so multiple market moves can remain separate durable candidates for the same event. `moveQuality` stores magnitude, volume, timing, and direction-clarity components plus label/rule IDs. `marketDivergence` stores inferred direction, observed market direction, detection state, reason, and rule IDs.

Source adapters are read-only and run behind the terminal source boundary. They must preserve deterministic fixture fallback and expose source health rather than failing the terminal when an upstream source is unavailable. The ingestion runner owns shared source execution policy: retryable fetch failures can use bounded deterministic backoff, and thrown source errors may carry `status`, `rateLimitRemaining`, and `rateLimitResetAt` metadata so durable source health and operator dashboards retain rate-limit/quota evidence.

Implemented `SourceAdapter` factories live in `src/lib/terminal/source-adapters.ts` for GDELT DOC, SEC EDGAR RSS, Federal Reserve RSS, USGS earthquakes, CISA RSS, Ethereum JSON-RPC logs, CoinGecko context, Etherscan indexed logs, FEMA/OpenFEMA IPAWS archived alerts, Reddit OAuth search, Mastodon public search, GNews, mediastack, and fact-check RSS overlays. Optional social/indexed/commercial-news/alert/fact-check adapters are disabled by default in the source registry and become runnable only when server-side configuration and the matching bridge source flag are present.

Sources that require deletion handling must not turn tombstoned content into evidence. The Reddit adapter preserves cursor advancement and raw replay metadata for deleted or removed submissions, but normalization emits no `NewsItem` rows for `[deleted]`, `[removed]`, moderator-removed, or banned submissions.

## Public Market Stream Contracts

`src/lib/terminal/polymarket-stream.ts` defines the read-only Polymarket market WebSocket boundary:

- `POLYMARKET_PUBLIC_WEBSOCKET_CHANNELS`: allowed unauthenticated public WebSocket channel manifest.
- `PolymarketMarketStreamAsset`: maps subscribed CLOB asset IDs to terminal market IDs and YES/NO outcomes.
- `PolymarketMarketSubscription`: subscription payload for the public `market` channel with custom public market features enabled and no auth fields.
- `PolymarketMarketStreamCheckpoint`: deterministic checkpoint cursor for each normalized public market-channel message.
- `normalizePolymarketMarketStreamMessage`: converts public market stream events into checkpoints and optional `MarketPriceRecord` rows for `market_price`.

The stream boundary explicitly excludes the authenticated user channel and does not model order placement, order cancellation, balances, custody, deposits, withdrawals, or private credentials.

## Raw Payloads And Replay

`RawDocument` metadata is immutable and checksum-backed. Raw payload storage is abstracted by `src/lib/terminal/raw-store.ts` and can use in-memory storage, file-backed local replay, or Supabase Storage. Replay rebuilds normalized evidence from raw blob keys plus adapter versions.

`source_cursor` state is abstracted by the terminal cursor store in `src/lib/terminal/ingestion-runner.ts`. Local runs use an in-memory cursor store; configured deployments can use the Supabase cursor store to read and upsert committed checkpoints. Durable cursor rows also retain internal run telemetry for observability: last HTTP status, rate-limit remaining/reset values, fetched/accepted counts, consecutive failures, and last error text. Failed source runs must not write an empty `cursor_json`; cursor checkpoints are updated only when a run has a real next cursor so rate-limit or outage telemetry cannot erase the last replayable checkpoint.

Replayable source truth must come from raw payload metadata, normalized documents, event clusters, score components, rule IDs, and timestamps. LLM narration, if added, is optional display copy and must not replace these records.

Event clusters carry `textSignature` metadata generated by `src/lib/terminal/source-intelligence.ts`: a deterministic `simhash64/minhash-v1` signature with member-level signatures. Cluster keys and IDs are derived from sorted member context/signatures, so the same member set produces the same cluster identity under replay even if source adapters return items in a different order. This supports near-duplicate clustering across sources even when canonical URLs differ. `timeline` entries are ordered by event chronology and preserve each member's observed/published/occurred timestamps, source ID/class, title, and role (`representative`, `corroborating`, or `contradicting`). `firstSeenAt` and `lastSeenAt` are observed-checkpoint bounds, not substitutes for the ordered member timeline.

## Query Packs

`src/lib/terminal/query-compiler.ts` builds per-market query packs before source collection. A query pack contains generated search queries, extracted entities, date constraints, source priorities, and GDELT terms. The ingest path records the generated pack for each market-led source collection run.

`market_registry.entities_json` stores the durable market-to-entity mapping derived from the same query compiler. Registry rows keep high-confidence named entities when available, falling back to topic entities only when no named entity is detected, so source discovery and why-moved evidence can reference deterministic market entities without relying on LLM narration.

## Delivery Outbox

`delivery_outbox` rows are the bridge fanout contract. They are read-only terminal updates for event clusters, why-moved candidates, source health, and replayable drills. `/api/terminal/stream` serves these updates through SSE when durable delivery is configured.
