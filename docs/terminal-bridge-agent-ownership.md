# Terminal Bridge Agent Ownership Matrix

Date: 2026-05-07

This matrix maps the requested Solvol bridge agent roles to concrete repository artifacts, verification checks, and current handoff state. It is an engineering ownership artifact, not a runtime permission model. Solvol Terminal remains strictly read-only: no role may add trade execution, order placement, custody, deposit, withdrawal, private-key, authenticated trading, or user fund flows.

## Shared Rules

- Source truth comes from normalized terminal contracts, public market/source payloads, provenance, deterministic scores, rule IDs, and timestamps.
- LLM output is optional narration only and cannot replace normalized data.
- New market adapters stay behind `MarketSource` in `src/lib/terminal/types.ts`.
- New external source adapters stay behind the source adapter boundary in `src/lib/terminal/types.ts` and `src/lib/terminal/source-adapters.ts`.
- Deterministic mock fallback must remain available for local `/terminal` demos without credentials.
- Production canary remains blocked until `npm run bridge:canary:check` reports `ready: true` in the target deployment environment and `npm run bridge:audit` leaves no unverified objective requirement beyond target-environment inputs.

## Explicit Responsibility Coverage

- Chief Architect Agent: owns architecture direction in `ARCHITECTURE.md`, approve contracts/interfaces through `DATA_CONTRACTS.md` and `SOLVOL_PROTOCOL.md` review, coordinate integration through `BRIDGE_IMPLEMENTATION_ROADMAP.md`, and preserve service topology boundaries across UI, API, bridge, persistence, replay, and rollout layers.
- Protocol & Contracts Agent: owns domain models, adapter contracts, provenance schema, scoring contracts, event and market state machines, and backward-compatible typed flows in `src/lib/terminal/types.ts`, `src/lib/terminal/state-machines.ts`, `DATA_CONTRACTS.md`, and `SOLVOL_PROTOCOL.md`.
- Market Intelligence Agent: owns Polymarket integration, market registry, price history ingestion, public WebSocket consumers, market reaction detection, market state tracking, market query compiler, market family classification, and market-to-entity mapping through `src/lib/terminal/query-compiler.ts`, `src/lib/terminal/market-registry.ts`, and `src/lib/terminal/source-intelligence.ts`.
- External Sources Agent: owns source adapters for GDELT, SEC EDGAR, Federal Reserve feeds, FEMA/OpenFEMA, USGS, CoinGecko, Etherscan, Ethereum JSON-RPC, Reddit, Mastodon, and optional secondary news APIs; polling and streaming systems; source health and quota management; retry/backoff behavior; resumable cursors; and adapter fixture tests.
- Normalization & Enrichment Agent: owns deterministic raw payload normalization, entity extraction, alias resolution, geo extraction, timestamp normalization, source credibility scoring, sentiment rules, event taxonomy, and enrichment pipelines.
- Event Clustering Agent: owns deduplication, canonical URL normalization, simhash/minhash logic, event clustering, event timelines, source diversity scoring, novelty scoring, contradiction detection, and rumor escalation tracking.
- Correlation & Why-Moved Agent: owns first-class `EventMarketLink` generation, market candidate generation, reaction-window scoring, confidence scoring, evidence breakdowns, insufficient-evidence handling, market divergence, move-quality scoring, and durable `event_market_link_json` evidence.

## Ownership Matrix

| Agent role | Primary artifacts | Owned responsibilities | Verification evidence |
| --- | --- | --- | --- |
| Chief Architect Agent | `ARCHITECTURE.md`, `guide.md`, `BRIDGE_IMPLEMENTATION_ROADMAP.md`, `docs/terminal-bridge-completion-audit.md` | Maintains bridge topology, runtime boundaries, deterministic replay posture, rollout architecture, and anti-coupling review. | `test/bridge-completion-audit.test.ts`, `test/bridge-rollout.test.ts`, `npm run build` |
| Protocol & Contracts Agent | `SOLVOL_PROTOCOL.md`, `DATA_CONTRACTS.md`, `src/lib/terminal/types.ts`, `src/lib/terminal/state-machines.ts` | Owns domain contracts, adapter interfaces, provenance schema, scoring fields, event and market state machines, and backward-compatible typed flows. | `test/terminal-foundation.test.ts`, `test/terminal-state-machines.test.ts`, `npx tsc --noEmit` |
| Market Intelligence Agent | `src/lib/terminal/polymarket-source.ts`, `src/lib/terminal/market-registry.ts`, `src/lib/terminal/polymarket-stream.ts`, `src/lib/terminal/market-family.ts`, `src/lib/terminal/query-compiler.ts` | Owns public Polymarket Gamma/CLOB/Data reads, market registry reconciliation, price history and reaction windows, public market WebSocket checkpoints, market family classification, and market-led query packs. | `test/polymarket-public-api.test.ts`, `test/polymarket-stream.test.ts`, `test/terminal-market-family.test.ts`, `test/query-compiler.test.ts` |
| External Sources Agent | `src/lib/terminal/source-registry.ts`, `src/lib/terminal/source-adapters.ts`, `src/lib/terminal/ingestion-runner.ts`, `src/lib/terminal/source-health.ts`, `src/lib/terminal/source-policy.ts` | Owns GDELT, SEC EDGAR, Federal Reserve, FEMA/OpenFEMA IPAWS, USGS, CISA, CoinGecko, Etherscan, Ethereum JSON-RPC, Reddit, Mastodon, GNews, mediastack, and fact-check overlay adapters; polling, retry/backoff, circuit breakers, quotas, and resumable cursors. | `test/terminal-ingestion-bridge.test.ts`, `test/source-connectors.test.ts`, `test/source-ingestion.test.ts`, `test/bridge-source-policy.test.ts` |
| Normalization & Enrichment Agent | `src/lib/terminal/source-intelligence.ts`, `src/lib/terminal/scoring.ts`, `src/lib/catalyst/source-scoring.ts`, `src/lib/context/source-documents.ts` | Owns timestamp normalization, source credibility, sentiment and impact rules, entity and geo extraction inputs, event taxonomy, source-document scoring, and deterministic enrichment outputs. | `test/terminal-ingestion-bridge.test.ts`, `test/source-ingestion.test.ts`, `test/terminal-data.test.ts`, `test/market-intel.test.ts` |
| Event Clustering Agent | `src/lib/terminal/source-intelligence.ts`, `src/lib/terminal/persistence.ts`, `src/lib/terminal/replay.ts`, `src/lib/terminal/serving.ts` | Owns canonical URL/fingerprint dedupe, `simhash64/minhash-v1` near-duplicate signatures, event clusters, timelines, source diversity, novelty, contradiction evidence, and rumor/refutation lifecycle handling. | `test/terminal-ingestion-bridge.test.ts`, `test/bridge-backfill-replay.test.ts`, `test/bridge-serving.test.ts` |
| Correlation & Why-Moved Agent | `src/lib/terminal/source-intelligence.ts`, `src/lib/terminal/types.ts`, `src/lib/terminal/persistence.ts`, `src/lib/terminal/operations.ts`, `src/lib/terminal/outbox.ts`, `src/components/terminal/SignalFlowWorkspace.tsx` | Owns event-to-market linking, candidate generation, reaction-window scoring, confidence, evidence breakdowns, insufficient-evidence handling, market divergence, move-quality scoring, durable link evidence, and operator-facing why-moved/provenance surfaces. | `test/terminal-ingestion-bridge.test.ts`, `test/terminal-surface.test.ts`, `test/bridge-serving.test.ts` |

## Release Gate

Before claiming the local product foundation is ready, run:

```bash
npm run lint
npx tsc --noEmit
node --test --experimental-strip-types test/*.test.ts
npm run build
npm run bridge:audit
git diff --check
```

Before claiming production canary readiness, also run `npm run bridge:canary:check` in the target deployment environment and verify `ready: true`.
