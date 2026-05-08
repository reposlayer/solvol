# Terminal Bridge Completion Audit

Date: 2026-05-08

Status: local bridge implementation is present and verified, but production canary is externally blocked. Do not mark the active goal complete until `npm run bridge:canary:check` reports `ready: true` in the target deployment environment and rollout ownership/approval gates are set.

## Objective Restatement

Implement the Solvol Terminal bridge described in `guide.md` and `BRIDGE_IMPLEMENTATION_ROADMAP.md` as a strictly read-only, market-led, deterministic, provenance-first ingestion and correlation system for Polymarket markets.

Concrete success criteria:

- Read the source planning docs: `AGENTS.md`, `SOLVOL_PLAN.md`, `ARCHITECTURE.md`, `DATA_CONTRACTS.md`, `guide.md`, and `BRIDGE_IMPLEMENTATION_ROADMAP.md`.
- Preserve the read-only boundary: no trade execution, order placement, custody, deposits, withdrawals, private-key handling, authenticated trading, or user fund flows.
- Preserve deterministic mock fallback so `/terminal` remains demoable without credentials.
- Treat public Polymarket Gamma/CLOB/Data as the authoritative market registry and price-reaction source.
- Keep source truth in normalized data, raw source payload metadata, provenance, scores, rule IDs, and timestamps. LLM output is optional narration only.
- Implement roadmap milestones: control plane, repo commands, market registry, price reactions, generic ingestion framework, Tier A official/open adapters, on-chain and secondary sources behind flags, query compiler, enrichment, dedupe, event clustering, deterministic why-moved scoring, source-health/provenance APIs, realtime delivery, replay, synthetic injection, and operations docs.
- Map the requested agent responsibilities to concrete artifacts, boundaries, and verification checks so ownership is auditable outside the conversation.
- Update `SOLVOL_PLAN.md` when milestones, verification, or blockers change.
- Run `npm run lint`, `npx tsc --noEmit`, `node --test --experimental-strip-types test/*.test.ts`, `npm run build`, `npm run bridge:canary:env-template`, `npm run bridge:canary:check`, `npm run bridge:audit`, and `git diff --check` before claiming the product foundation is ready.
- Continue until implemented, verified, documented, and ready for production canary, or until blocked by mandatory credentials, deployment access, or source policy/ToS constraints.

## Prompt-To-Artifact Checklist

| Requirement | Evidence | Verification | Status |
| --- | --- | --- | --- |
| Source planning docs inspected | `AGENTS.md`, `SOLVOL_PLAN.md`, `ARCHITECTURE.md`, `DATA_CONTRACTS.md`, `guide.md`, `BRIDGE_IMPLEMENTATION_ROADMAP.md` | `wc -l AGENTS.md SOLVOL_PLAN.md ARCHITECTURE.md DATA_CONTRACTS.md guide.md BRIDGE_IMPLEMENTATION_ROADMAP.md` | Present |
| Coordinated agent ownership model | `docs/terminal-bridge-agent-ownership.md` maps the Chief Architect, Protocol & Contracts, Market Intelligence, External Sources, Normalization & Enrichment, Event Clustering, and Correlation & Why-Moved roles to owned artifacts, explicit prompt responsibilities, boundaries, and checks | `test/bridge-completion-audit.test.ts` verifies the ownership matrix names every requested role, core bridge artifacts, named agent responsibilities, and required verification gates | Present |
| Strict read-only boundary | `SOLVOL_PROTOCOL.md`, `src/lib/polymarket/public-api.ts`, `src/lib/terminal/bridge-control.ts`, terminal bridge tests, and `completionAudit.readOnlyBoundaryChecks` scanning production code/schema files | `test/bridge-completion-audit.test.ts` verifies `readOnlyBoundaryViolations: []`; `test/polymarket-public-api.test.ts` and `test/bridge-control.test.ts` verify public read-only surfaces | Present |
| Deterministic mock fallback | `src/lib/terminal/mock-source.ts`, `src/lib/terminal/api-demo.ts`, fixture paths in `src/lib/terminal/source-adapters.ts` | `test/terminal-data.test.ts`, `test/terminal-ingestion-bridge.test.ts`, API fallback smoke logs in `SOLVOL_PLAN.md` | Present |
| public Polymarket Gamma/CLOB/Data authoritative layer | `src/lib/polymarket/public-api.ts`, `src/lib/terminal/polymarket-source.ts`, `src/lib/terminal/market-registry.ts`, `src/lib/terminal/polymarket-stream.ts` | `test/polymarket-public-api.test.ts`, `test/polymarket-stream.test.ts`, `test/terminal-ingestion-bridge.test.ts` market registry, price reaction, public stream manifest, and checkpoint tests | Present |
| Source truth from normalized data, raw metadata, provenance, scores, rule IDs, timestamps | `src/lib/terminal/types.ts`, `src/lib/terminal/source-registry.ts`, `src/lib/terminal/raw-store.ts`, `src/lib/terminal/source-intelligence.ts` | `test/terminal-ingestion-bridge.test.ts` provenance/checksum, scoring, replay, persistence tests | Present |
| Control plane and repo commands | `src/lib/terminal/bridge-control.ts`, `scripts/bridge.mjs`, `package.json` bridge scripts | `test/bridge-control.test.ts`, `npm run bridge:health` | Present |
| Market registry and price reactions | `src/lib/terminal/market-registry.ts`, `src/lib/terminal/polymarket-source.ts`, `src/lib/terminal/polymarket-stream.ts`; `market_registry.entities_json` persists deterministic query-compiler-derived entity refs | `test/terminal-ingestion-bridge.test.ts` market registry entity, reaction window, persistence, and schema assertions; `test/polymarket-stream.test.ts` stream-to-price-record assertions | Present |
| Generic ingestion framework | `src/lib/terminal/ingestion-runner.ts`, `src/lib/terminal/persistence.ts`, `src/lib/terminal/raw-store.ts`, `src/lib/terminal/source-health.ts` | `test/terminal-ingestion-bridge.test.ts` runner, durable/in-memory cursor, retry/backoff, rate-limit metadata, persistence, durable telemetry hydration, failed-source cursor preservation, degraded-source tests | Present |
| Tier A official/open sources | GDELT, SEC RSS, Federal Reserve RSS, USGS GeoJSON, CISA RSS adapters in `src/lib/terminal/source-adapters.ts` | `test/terminal-ingestion-bridge.test.ts`, `test/source-ingestion.test.ts`, `test/source-connectors.test.ts` | Present |
| On-chain and secondary source adapters behind flags | Ethereum JSON-RPC, CoinGecko, Etherscan indexed logs, FEMA/OpenFEMA IPAWS alerts, Reddit OAuth search, Mastodon public search, GNews, mediastack, and fact-check overlay adapters in `src/lib/terminal/source-adapters.ts`; scheduled ingest requires matching `SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_*` flags | `test/terminal-ingestion-bridge.test.ts`, `test/source-ingestion.test.ts`, `test/bridge-source-policy.test.ts`, `test/bridge-control.test.ts`; Reddit tombstone regression verifies deleted/removed posts do not become evidence rows | Present, optional sources intentionally disabled |
| Query compiler | `src/lib/terminal/query-compiler.ts`, integration in `src/lib/context/ingest.ts` | `test/query-compiler.test.ts`, `test/source-ingestion.test.ts` | Present |
| Market-family classification | `src/lib/terminal/market-family.ts`, `src/lib/terminal/source-intelligence.ts` integration | `test/terminal-market-family.test.ts`, `test/terminal-ingestion-bridge.test.ts` approval and score-rule assertions | Present |
| Market/event state machines | `src/lib/terminal/state-machines.ts`, transition contracts in `src/lib/terminal/types.ts` | `test/terminal-state-machines.test.ts` verifies accepted and rejected market status and event lifecycle transitions | Present |
| Enrichment, dedupe, event clustering | `src/lib/terminal/source-intelligence.ts` exact dedupe, deterministic event clustering, `simhash64/minhash-v1` near-duplicate signatures, order-invariant cluster identity, ordered member timelines, source diversity, novelty, lifecycle status, rumor status, and contradiction records | `test/terminal-ingestion-bridge.test.ts` dedupe, near-duplicate signature, shuffled-order identity, event clustering replay, ordered timeline, observed first/last seen, and refuted-rumor contradiction tests | Present |
| Deterministic why-moved scoring | `src/lib/terminal/source-intelligence.ts`, `src/lib/terminal/operations.ts`, `src/lib/terminal/persistence.ts`; `why_moved_candidate.event_market_link_json` persists deterministic event-to-market candidate links | `test/terminal-ingestion-bridge.test.ts` event-to-market link generation, unrelated-event filtering, score breakdown/rule ID assertions, contradictory evidence, insufficient-evidence, market-divergence, move-quality, reaction `moveId`, and link persistence regressions | Present |
| Operator-visible why-moved evidence quality | `src/components/terminal/SignalFlowWorkspace.tsx` why-moved cards and provenance drawer expose evidence status, move quality, market divergence, and conflicting evidence IDs from `WhyMovedCandidate` | `test/terminal-surface.test.ts` evidence-quality surface assertion | Present |
| Source-health/provenance/status APIs | `/api/terminal/sources`, `/api/terminal/provenance`, `/api/terminal/events`, `/api/terminal/why-moved`, `/api/terminal/bridge-status`, durable serving readers in `src/lib/terminal/serving.ts`; bridge status exposes rollout, canary handoff, observability, source policy, and `completionAudit` | `test/bridge-serving.test.ts`, `test/terminal-ingestion-bridge.test.ts` durable row, fallback, and status-surface coverage | Present |
| Realtime delivery via SSE/outbox | `src/lib/terminal/persistence.ts`, `src/lib/terminal/outbox.ts`, `/api/terminal/stream` | `test/terminal-ingestion-bridge.test.ts` verifies event, why-moved, and source-health `delivery_outbox` rows plus outbox reader/publisher behavior; `test/bridge-serving.test.ts` covers the stream route | Present |
| Replay and backfill | `src/lib/terminal/replay.ts`, `src/lib/terminal/backfill.ts`, `scripts/bridge.mjs` | `test/bridge-backfill-replay.test.ts`, `test/terminal-ingestion-bridge.test.ts` raw replay tests | Present |
| Synthetic injection | `src/lib/terminal/synthetic.ts`, `bridge:inject:synthetic` | `test/bridge-synthetic.test.ts` | Present |
| Operations docs and rollout handoff | `docs/terminal-bridge-operations.md`, `src/lib/terminal/observability.ts`, `src/lib/terminal/source-policy.ts`, `src/lib/terminal/rollout.ts`, `src/lib/terminal/canary-handoff.ts`, `bridge:canary:env-template`; rollout phases include audience, user-facing card exposure, canary feature flags, `readyForProductionCanary`, and `readyForGeneralRollout` | `test/bridge-ops-docs.test.ts`, `test/bridge-observability.test.ts`, `test/bridge-source-policy.test.ts`, `test/bridge-rollout.test.ts`, `test/bridge-canary-handoff.test.ts` | Present |
| Read-only completion audit command | `src/lib/terminal/completion-audit.ts`, `scripts/bridge.mjs`, `package.json` expose `npm run bridge:audit` for the prompt-to-artifact checklist, roadmap deliverable items, read-only `artifactChecks`, `missingArtifacts`, `contentChecks`, `missingContentMarkers`, `readOnlyBoundaryChecks`, `readOnlyBoundaryViolations`, `verificationLogChecks`, `missingVerificationLogEntries`, `verificationCommandChecks`, `verificationCommandAvailabilityChecks`, `missingVerificationCommands`, current blockers, and completion decision | `test/bridge-completion-audit.test.ts`, `test/bridge-control.test.ts`, `npm run bridge:audit` | Present |
| Required verification gate | `SOLVOL_PLAN.md` verification log | Latest required run: lint passed cleanly, TypeScript passed, 185 tests passed, build passed, `bridge:canary:env-template` passed as a read-only dry run, `bridge:audit` passed as a read-only dry run with `completionAudit.achieved: false`, `git diff --check` passed; `bridge:canary:check` passed as read-only dry run with `ready: false` | Present |
| Production canary readiness | `src/lib/terminal/canary-readiness.ts`, `src/lib/terminal/canary-handoff.ts`, `src/lib/terminal/rollout.ts`; readiness includes required config checks for any enabled source flag | `npm run bridge:canary:check`, `test/bridge-canary.test.ts` | Blocked externally |

## Current Canary Blockers

`npm run bridge:canary:check` is read-only and currently reports `ready: false`.

Mandatory production canary inputs still missing in the current environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SOLVOL_RAW_STORAGE_BUCKET`
- `SOLVOL_BRIDGE_BROADCASTER_URL` or `SOLVOL_BRIDGE_REDIS_URL`
- `SOLVOL_ERROR_MONITORING_DSN`
- `SOLVOL_METRICS_DSN`
- `SOLVOL_ALERT_ROUTING_URL`
- `SOLVOL_DEPLOY_TARGET`
- `SOLVOL_POSTGRES_BACKUP_VERIFIED`
- `SOLVOL_SOURCE_POLICY_REVIEWED`
- `SOLVOL_CANARY_OWNER`
- `SOLVOL_CANARY_REVIEWER`
- `SOLVOL_ROLLBACK_APPROVER`

Current infrastructure discovery also found a target-access blocker: Vercel team/project access is not available through the connected tooling in this session. The linked `solvol` Vercel project returned `403 Forbidden`, `_list_teams` returned no accessible teams, and Supabase project tooling was not exposed. Operators need Vercel project settings access and Supabase admin access before these canary inputs can be configured or verified in the target environment.

Rollout handoff also reports staging/general rollout gate inputs until they are explicitly set in the deployment environment. `readyForProductionCanary` and `readyForGeneralRollout` are separate runtime booleans so operators do not confuse a canary-ready bridge with public rollout approval.

- `SOLVOL_STAGING_SHADOW_SOAK_PASSED`
- `SOLVOL_REPLAY_DETERMINISM_VERIFIED`
- `SOLVOL_ANALYST_QA_APPROVED`
- `SOLVOL_CANARY_WINDOW_PASSED`
- `SOLVOL_NO_P1_P2_DEFECTS`

`npm run bridge:canary:env-template` expands the blocker list into shell-safe handoff templates with empty secret/URL values and `false` defaults for approval gates. In this environment the production-canary `template` lists `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SOLVOL_RAW_STORAGE_BUCKET`, `SOLVOL_BRIDGE_BROADCASTER_URL`, `SOLVOL_BRIDGE_REDIS_URL`, `SOLVOL_ERROR_MONITORING_DSN`, `SOLVOL_METRICS_DSN`, `SOLVOL_ALERT_ROUTING_URL`, `SOLVOL_DEPLOY_TARGET`, `SOLVOL_POSTGRES_BACKUP_VERIFIED`, `SOLVOL_SOURCE_POLICY_REVIEWED`, `SOLVOL_CANARY_OWNER`, `SOLVOL_CANARY_REVIEWER`, `SOLVOL_ROLLBACK_APPROVER`, `SOLVOL_STAGING_SHADOW_SOAK_PASSED`, `SOLVOL_REPLAY_DETERMINISM_VERIFIED`, and `SOLVOL_ANALYST_QA_APPROVED`. Its separate `generalRolloutTemplate` lists `SOLVOL_CANARY_WINDOW_PASSED` and `SOLVOL_NO_P1_P2_DEFECTS` for public rollout after canary. The command also emits `accessPrerequisites` so operators see the required Vercel team/project settings access, Supabase project admin access, observability/alert ownership, source policy approval, canary review, and rollback approval before entering placeholders.

`npm run bridge:audit` emits the same completion decision in a machine-readable payload. In this environment it remains read-only, reports `achieved: false`, includes concrete artifact existence checks through `artifactChecks`/`missingArtifacts`, validates required artifact content markers through `contentChecks`/`missingContentMarkers` including the explicit source-adapter IDs for GDELT, SEC, Federal Reserve, USGS, CISA, FEMA, Etherscan, Ethereum JSON-RPC, CoinGecko, Reddit, Mastodon, GNews, mediastack, and fact-check overlays, scans production code and schema files for forbidden trading/custody implementation symbols through `readOnlyBoundaryChecks`/`readOnlyBoundaryViolations`, inspects the plan verification log through `verificationLogChecks`/`missingVerificationLogEntries`, validates required command availability through `verificationCommandAvailabilityChecks`/`missingVerificationCommands`, maps named planning docs, repo commands, API routes, replay/backfill, synthetic injection, and operations handoff items into the runtime checklist, includes `accessPrerequisites` for Vercel/Supabase/observability/approval access, and points the next action at configuring missing inputs in the target deployment environment before rerunning `npm run bridge:canary:check`.

## Intentionally Mocked, Disabled, Or Feature-Flagged

- Etherscan indexed enrichment remains disabled as optional secondary/indexed enrichment; source truth should come from raw Ethereum JSON-RPC logs.
- FEMA/OpenFEMA IPAWS, Reddit OAuth search, and Mastodon public search adapters are implemented but disabled by default until source policy, credentials, deletion handling, and ToS gates are reviewed.
- GNews, mediastack, and fact-check overlays are implemented as read-only adapters but remain disabled by default until credentials/feed URLs, matching source flags, and source-policy gates are configured.
- Live GDELT DOC, SEC RSS, Federal Reserve RSS, USGS GeoJSON, CISA RSS, Ethereum JSON-RPC, Etherscan indexed logs, FEMA/OpenFEMA IPAWS, Reddit, Mastodon, GNews, mediastack, fact-check overlays, and CoinGecko market context are opt-in behind environment variables and source feature flags.
- Deterministic fixture/mock fallback remains the default local/demo path for `/terminal` and bridge tests.

## Audit Decision

Do not call the goal complete from this audit alone. The local implementation and verification evidence cover the bridge foundation, but production canary remains blocked by mandatory infrastructure, deployment, source-policy, ownership, and rollback inputs.
