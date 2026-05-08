# Solvol Terminal Architecture

## Product Shape

Solvol Terminal is a dense, dark, keyboard-first Next.js App Router application. The primary rendered surface is `/terminal`, with explicit module routes under `/terminal/*` and market detail routes under `/terminal/market/[id]` and `/market/[id]`.

Route metadata lives in `src/lib/terminal/routes.ts` and covers:

- All Markets / Browse
- Trending
- Market detail
- Movers / flow
- Deadlines
- Sources
- Alerts
- Watchlist
- System/data-source status

## Runtime Layers

- UI shell: `src/components/terminal/TerminalShell.tsx`
- Live desk workspace: `src/components/terminal/SignalFlowWorkspace.tsx`
- Route sync: `src/components/terminal/TerminalUrlSync.tsx`
- Terminal state: `src/components/terminal/terminal-context.tsx`
- React Query hooks: `src/hooks/useTerminalDiscovery.ts`, `src/hooks/useMarketSnapshot.ts`, `src/hooks/useMarketIntel.ts`
- API routes: `src/app/api/discovery`, `src/app/api/market/[id]`, `src/app/api/market/[id]/intel`, `src/app/api/explain`, and read-only terminal bridge routes under `src/app/api/terminal/*`

The UI is read-only. Buttons and commands can focus markets, run catalyst analysis, save local state, save research records, and open source links. They do not execute trades.

## Data Flow

1. Discovery routes request public Polymarket Gamma/CLOB/Data reads.
2. API routes normalize market snapshots, order book summaries, trades, source documents, events, market moves, scores, and correlations.
3. React Query polls the read-only API routes using the cadence in `src/hooks/terminal-refresh.ts`.
4. The terminal context persists local UI state, watchlist pins, command history, theme, workspace mode, and local alert rules to `localStorage`.
5. Supabase-backed research endpoints are optional and database-ready for saved workspaces, alerts, reports, and Source Ledger records.

Scheduled source ingestion starts from market-led Polymarket discovery. `src/lib/context/ingest.ts` compiles query packs for discovered markets, resolves those market IDs through `createPolymarketMarketSource()`, and passes terminal `Market[]` into `runTerminalIngestionBridge()` so scheduled runs can persist `market_registry`, `market_price`, reaction windows, and why-moved candidates instead of only external source rows.

Public Polymarket market streaming is isolated in `src/lib/terminal/polymarket-stream.ts`. It models only the unauthenticated CLOB market WebSocket channel, builds subscription payloads from known YES/NO asset IDs, normalizes `book`, `best_bid_ask`, `last_trade_price`, and related public market events into deterministic checkpoints, and emits `MarketPriceRecord` updates without introducing user-channel auth, order, or cancellation flows.

Terminal source adapters are all read-only and opt-in for live polling. Implemented bridge adapters include GDELT DOC, SEC EDGAR RSS, Federal Reserve RSS, USGS GeoJSON, CISA RSS, Ethereum JSON-RPC logs, CoinGecko markets, Etherscan indexed logs, FEMA/OpenFEMA IPAWS archived alerts, Reddit OAuth search, Mastodon public search, GNews, mediastack, and fact-check RSS overlays. Scheduled ingest requires both server-side source configuration and the matching `SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_*` flag before using a live adapter. Reddit and Mastodon also require `SOLVOL_FLAG_BRIDGE_SOCIAL_LOW_TRUST_SOURCES=true`.

`runTerminalIngestionBridge()` is the shared source execution boundary. It reads durable cursors when Supabase service-role config is present, stores immutable raw payload envelopes before normalization artifacts are persisted, retries retryable source fetch failures with bounded deterministic backoff when configured, captures HTTP/rate-limit metadata from thrown source errors, and commits source cursors only after persistence succeeds. Why-moved candidates carry the scored reaction `moveId`, and Supabase upserts use `(market_id, event_id, move_id)` so repeated price-reaction windows for one event remain auditable instead of collapsing into one row.

## Deterministic Intelligence

Core deterministic engines:

- Scoring: `src/lib/terminal/scoring.ts`
- Alerts: `src/lib/terminal/alerts.ts`
- Timeline merge: `src/lib/terminal/timeline.ts`
- Source ingestion: `src/lib/terminal/ingestion-runner.ts`
- Source intelligence: `src/lib/terminal/source-intelligence.ts`
- Market registry and reaction windows: `src/lib/terminal/market-registry.ts`
- Public Polymarket market stream checkpoints: `src/lib/terminal/polymarket-stream.ts`
- Query packs: `src/lib/terminal/query-compiler.ts`
- Replay/backfill/operations: `src/lib/terminal/replay.ts`, `src/lib/terminal/backfill.ts`, `src/lib/terminal/operations.ts`
- Mock fallback: `src/lib/terminal/mock-source.ts` and `src/lib/terminal/api-demo.ts`
- Polymarket adapter boundary: `src/lib/terminal/polymarket-source.ts`

The "why market moved" surface is deterministic first: price move windows, wallet/trade timing, source document timing, impact labels, correlation scores, evidence status, move-quality components, and market-divergence checks determine the ranked evidence. LLM narration remains optional and cannot replace normalized facts.

Event clustering combines exact URL/fingerprint dedupe with deterministic near-duplicate signatures. `src/lib/terminal/source-intelligence.ts` computes `simhash64/minhash-v1` member signatures and stores a cluster-level `textSignature` so replay can explain why similar reports from different sources clustered together. Cluster keys and IDs are derived from sorted member context/signatures, not source iteration order, so replay of the same member set preserves event identity. Clusters also carry deterministic source-diversity and novelty scores, lifecycle status, rumor status, and contradiction records so fact-check overlays can refute social claims and why-moved candidates can expose conflicting evidence instead of presenting rumor-only moves as settled truth.

State transitions are explicit and deterministic in `src/lib/terminal/state-machines.ts`. Market status transitions preserve terminal `resolved` markets, event lifecycle transitions preserve terminal `refuted` events, and invalid transitions produce auditable `accepted: false` records with stable rule IDs instead of mutating state.

Market family classification is first-class in `src/lib/terminal/market-family.ts`. Why-moved scoring now asks that classifier for approval, price-threshold, election, filing, enforcement, on-chain, weather, sports, or generic context before assigning family-specific direction rule IDs, which keeps market-family semantics reusable outside the correlation engine.

## Bridge Persistence And Delivery

The bridge models live in `supabase/schema.sql` and in mapping helpers under `src/lib/terminal/persistence.ts`. They cover source registry, source cursors, immutable raw payload metadata, normalized news, event clusters, market registry rows, market prices, why-moved candidates, and delivery outbox rows.

Raw payload storage is abstracted behind `src/lib/terminal/raw-store.ts`, with deterministic in-memory fallback, file-backed local replay, and Supabase Storage support. Cursor storage is abstracted in `src/lib/terminal/ingestion-runner.ts`, with in-memory fallback and a Supabase `source_cursor` implementation when service-role environment variables are configured.

Terminal serving is read-only and durable-first when Supabase service-role config is present. `src/lib/terminal/serving.ts` maps `event_cluster`, `event_cluster_member`, `news_item`, and `why_moved_candidate` rows back into terminal contracts for `/api/terminal/events`, `/api/terminal/provenance`, and `/api/terminal/why-moved`; each route keeps deterministic synthetic fallback behavior when durable rows are unavailable. Realtime delivery is outbox-led: `src/lib/terminal/persistence.ts` emits delivery rows for event clusters, why-moved candidates, and source-health snapshots, while `/api/terminal/stream` serves SSE from durable delivery outbox reads when configured and keeps deterministic fallback behavior for local demos.

## Operations And Rollout

Read-only bridge commands are exposed through `scripts/bridge.mjs` and `npm run bridge:*`. They cover health, dry-run backfill, replay, synthetic drills, source pause/resume plans, retention planning, canary checks, and canary environment templates.

Production canary remains gated by `npm run bridge:canary:check`. The checker requires Supabase/Postgres, raw object storage, fanout or Redis, observability, alert routing, deployment target, backup verification, source policy review, canary owner, canary reviewer, and rollback approver inputs before promotion.

## Persistence

Local-first persistence:

- `solvol:terminal:watchlist`
- `solvol:terminal:alert-rules`
- `solvol:terminal:command-history`
- `solvol:terminal:workspace-mode`
- `solvol:terminal:theme`

Database-ready persistence:

- Supabase schema in `supabase/schema.sql`
- research persistence helpers in `src/lib/research/supabase.ts`
- local structures use stable IDs and normalized market IDs so they can be promoted to database records.

## Verification

The product foundation is guarded by Node tests for:

- terminal data normalization and mock fallback
- scoring utilities
- alert evaluation
- timeline merge
- why-moved correlation
- route and UI artifact coverage
- terminal UI surface markers

Run the full verification suite before release:

```bash
npm run lint
npx tsc --noEmit
node --test --experimental-strip-types test/*.test.ts
npm run build
```
