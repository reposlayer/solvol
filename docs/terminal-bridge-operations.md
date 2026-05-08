# Terminal Bridge Operations Runbook

Solvol Terminal bridge operations are read-only. Commands may inspect, replay, or generate deterministic drill payloads, but they must not place orders, transfer assets, or require user fund credentials.

## Command Surface

- `npm run bridge:health` prints control-plane feature flags, read-only command metadata, and local readiness state.
- `npm run bridge:backfill:markets` dry-runs the public Polymarket registry backfill plan.
- `npm run bridge:backfill:source -- --source=gdelt-doc --since=2026-05-01` dry-runs source backfill inputs for an enabled adapter.
- `npm run bridge:replay -- --fixture=fixtures/replay/window-001` validates raw payload replay determinism.
- `npm run bridge:inject:synthetic -- --scenario=breaking-news-spike` emits deterministic drill data for fake breaking news, duplicate bursts, source outages, rate-limit incidents, and price moves.
- `npm run bridge:pause-source -- --source=gdelt-doc` records the operator intent to pause a source in runbook flow.
- `npm run bridge:resume-source -- --source=gdelt-doc` records the operator intent to resume a source in runbook flow.
- `npm run bridge:retention:plan` emits the read-only retention and downsample plan for raw payload metadata, normalized source documents, event clusters, and market prices.
- `npm run bridge:audit` emits the read-only objective-to-artifact completion audit, required verification commands, and current canary/rollout blockers.
- `npm run bridge:canary:check` emits the read-only readiness checklist for mandatory staging/canary infrastructure, source policy review, ownership, rollback approval, and required config for any enabled source flag.
- `npm run bridge:canary:env-template` emits a read-only `.env` template for the missing canary and rollout handoff inputs. It does not include secret values.

Pause/resume commands include a `sourceControlPlan` from `src/lib/terminal/source-control.ts`. The plan is dry-run only: it names the source flag to change, preserves source cursors and raw payload metadata, and asks operators to run replay and monitor source lag, DLQ growth, accepted item counts, and fanout latency after resume.

`/api/terminal/bridge-status` also exposes a source policy catalog from `src/lib/terminal/source-policy.ts`. The catalog classifies each source as core, Tier A, optional, or secondary; records whether it is server-only, credentialed, correctness-critical, deletion-aware, and client-exposable; and reports whether `SOLVOL_SOURCE_POLICY_REVIEWED` has been set. The catalog does not approve promotion by itself: source policy review remains a human gate before staging active or production canary.

The same status endpoint exposes the rollout plan from `src/lib/terminal/rollout.ts`. It maps local/CI, staging shadow, staging active, production canary, and general rollout phases to concrete missing inputs, rollout audience, user-facing explanation-card exposure, and the production-canary feature flags. Treat this as the operator phase gate: production canary remains blocked until the plan reports `readyForProductionCanary: true` and `npm run bridge:canary:check` reports `ready: true`. Public rollout remains separately blocked until the plan reports `readyForGeneralRollout: true`.

`npm run bridge:canary:check` and `/api/terminal/bridge-status` also include a `canaryHandoff` report from `src/lib/terminal/canary-handoff.ts`. It aggregates canary readiness, rollout, observability, source-policy blockers, and `accessPrerequisites` into one read-only handoff payload for the operator responsible for configuring infrastructure and approvals.

Use `npm run bridge:canary:env-template` when handing off to deployment operators. The command expands either/or blockers such as broadcaster versus Redis into concrete environment keys, uses empty values for secrets/URLs, uses `false` defaults for approval gates, and returns the same `accessPrerequisites` checklist for Vercel project settings access, Supabase admin access, observability/alert ownership, and canary/rollback approval. Its primary `template` covers canary and pre-canary blockers; `generalRolloutTemplate` separately lists public-rollout gates so `SOLVOL_CANARY_WINDOW_PASSED` and `SOLVOL_NO_P1_P2_DEFECTS` are not mistaken for production-canary prerequisites.

Use `npm run bridge:audit` before any completion or promotion claim. The command is read-only and returns the prompt-to-artifact checklist from `src/lib/terminal/completion-audit.ts`, including the current `decision`, `missingInputs`, and `nextAction`.

The same completion audit is exposed as `completionAudit` on `/api/terminal/bridge-status` for read-only operator dashboards that cannot run shell commands.

## Rollout Gate Inputs

The rollout checker may report these operator inputs. Keep them in sync with `.env.example` and `src/lib/terminal/rollout.ts`.

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: required for source cursors, bridge rows, outbox state, and source health.
- `SOLVOL_RAW_STORAGE_BUCKET`: required for immutable raw payload envelopes and replay windows.
- `SOLVOL_BRIDGE_REDIS_URL` or `SOLVOL_BRIDGE_BROADCASTER_URL`: required before live staging delivery tests and production fanout.
- `SOLVOL_ERROR_MONITORING_DSN`, `SOLVOL_METRICS_DSN`, and `SOLVOL_ALERT_ROUTING_URL`: required for source failure, replay, DLQ, and fanout lag monitoring.
- `SOLVOL_DEPLOY_TARGET`: required to identify the staging/canary deployment target and rollback surface.
- `SOLVOL_SOURCE_POLICY_REVIEWED`: required before live source polling leaves local/demo mode.
- `SOLVOL_STAGING_SHADOW_SOAK_PASSED`, `SOLVOL_REPLAY_DETERMINISM_VERIFIED`, and `SOLVOL_ANALYST_QA_APPROVED`: required before staging active can promote toward canary.
- `SOLVOL_POSTGRES_BACKUP_VERIFIED`, `SOLVOL_CANARY_OWNER`, `SOLVOL_CANARY_REVIEWER`, and `SOLVOL_ROLLBACK_APPROVER`: required before production canary.
- `SOLVOL_CANARY_WINDOW_PASSED` and `SOLVOL_NO_P1_P2_DEFECTS`: required before general rollout after canary.

`supabase/schema.sql` includes explicit `service_role` Data API grants and RLS for the public schema tables Solvol creates. Do not grant broad `anon` or `authenticated` table access unless a direct browser Data API workflow is added and reviewed with matching RLS policies.

## Dashboards And Alerts

Minimum staging dashboards must show source lag, source health, last HTTP status, rate-limit remaining/reset telemetry, accepted item counts, rejected item counts, DLQ counts, backlog estimates, raw payload write errors, replay determinism status, outbox backlog, and fanout latency. Cursor checkpoints remain replay-critical: failed source runs may update telemetry and failure counts, but must not replace the last committed `cursor_json` with an empty cursor.

`/api/terminal/bridge-status` exposes the read-only observability catalog from `src/lib/terminal/observability.ts`, including dashboard metric IDs, alert IDs, and the required metrics/alert-routing environment inputs. This catalog is a local/operator contract; production canary still requires the actual metrics backend and alert routing to be configured.

Minimum alerts:

- Source failure: health becomes `failing` or consecutive failures exceed the circuit-breaker threshold.
- Rate limit: upstream returns HTTP 429 or `rateLimitRemaining` reaches zero.
- DLQ growth: replayable dead-letter count increases across two consecutive scheduler runs.
- Replay nondeterminism: pinned fixture window changes normalized IDs, cluster IDs, or candidate score hashes outside tolerance.
- Fanout latency: unread delivery outbox age or SSE fanout latency breaches the staging target.

## Source Onboarding

1. Add the source registry entry as `readOnly: true`.
2. Keep the source disabled until a fixture adapter, idempotency key, cursor shape, and source-health status exist.
3. Run fixture normalization and replay tests.
4. Enable the feature flag only in staging shadow mode with a low rate-limit budget.
5. Review source lag, dedupe collapse ratio, DLQ counts, and why-moved false-positive samples before promotion.

Optional commercial/news-overlay adapters stay server-side. GNews requires `SOLVOL_TERMINAL_GNEWS_API_KEY` and `SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_GNEWS_API=true`; mediastack requires `SOLVOL_TERMINAL_MEDIASTACK_API_KEY` and `SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_MEDIASTACK_API=true`; fact-check overlays require `SOLVOL_TERMINAL_FACT_CHECK_RSS_URL` and `SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_FACT_CHECK_OVERLAYS=true`. Query terms are compiled from markets first, with `SOLVOL_TERMINAL_GNEWS_TERMS` and `SOLVOL_TERMINAL_MEDIASTACK_TERMS` available as additional filters. Reddit and Mastodon also require `SOLVOL_FLAG_BRIDGE_SOCIAL_LOW_TRUST_SOURCES=true` in addition to their source-specific flags.

## Source Outage

1. Run `npm run bridge:health`.
2. Confirm the failing source and cursor from `/api/terminal/sources`.
3. Run `npm run bridge:pause-source -- --source=<source-id>` and disable the matching `SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_*` flag if the incident is not transient.
4. Preserve the last good cursor. Do not delete raw payload metadata.
5. Resume with `npm run bridge:resume-source -- --source=<source-id>` after health checks recover.

## Rate-Limit Incident

1. Treat HTTP 429 as degraded source health and stop increasing concurrency.
2. Lower the source budget, increase poll interval, or disable the source flag.
3. Run `npm run bridge:inject:synthetic -- --scenario=rate-limit-incident` to verify operator/UI handling.
4. Record the reset time and only resume after the source policy window clears.

## Replay

1. Use immutable raw payload keys and adapter versions as source truth.
2. Run `npm run bridge:replay -- --fixture=<fixture-window>`.
3. Compare normalized item IDs, event cluster IDs, why-moved candidate IDs, score breakdowns, and rule IDs.
4. If replay changes unexpectedly, freeze promotion until the fixture, source adapter, or scoring rule version explains the change.

## Retention And Downsample

1. Run `npm run bridge:retention:plan` before staging shadow mode and after any retention policy change.
2. Confirm the plan covers `raw_document`, `news_item`, `event_cluster`, and `market_price`.
3. Treat the checked-in command as dry-run only. Any destructive production retention job must be reviewed against backups and replay fixtures first.
4. Market price downsampling must preserve deterministic bucket representatives so reaction-window replay remains stable.

## Why-Moved False Positive

1. Hide user-facing explanation cards by disabling `SOLVOL_FLAG_BRIDGE_CORRELATION_WHY_MOVED_V1` or the UI provenance flag.
2. Keep raw ingest and source-health capture running when safe.
3. Add contradiction evidence or lower confidence thresholds in deterministic rules.
4. Add a replay fixture before re-enabling visible why-moved cards.

## Migration Failure

1. Stop normalized writes and outbox publishing for the affected environment.
2. Keep raw capture only if the raw store and source cursor writes remain consistent.
3. Restore from the last verified backup or rerun the migration in staging.
4. Run replay against affected windows before any production promotion.

## Rollback

Rollback owner: assign before production canary. Canary reviewer: assign before production canary. Rollback approver: assign before production canary.

Rollback steps:

1. Disable source-specific `SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_*` flags first.
2. Disable `SOLVOL_FLAG_BRIDGE_UI_PROVENANCE_PANEL`, `SOLVOL_FLAG_BRIDGE_REALTIME_SSE`, and `SOLVOL_FLAG_BRIDGE_CORRELATION_WHY_MOVED_V1` if user-facing surfaces are affected.
3. Pause source scheduler runs and outbox publishing.
4. Leave read-only APIs and deterministic mock fallback available for `/terminal`.
5. Preserve raw payload metadata, cursors, DLQ entries, and replay fixtures for incident review.

## Staging Shadow

Live ingest may run, but user-facing why-moved explanation cards remain hidden. Gates: source lag stable, DLQ flat, replay deterministic, no uncontrolled backlog, source policies confirmed.

## Staging Active

Internal users may see why-moved cards, source-health panels, provenance, and SSE updates. Gates: manual analyst QA passes for high-confidence candidates, synthetic drills appear within target latency, and rollback steps have been rehearsed.

## Production Canary

Enable a small internal market set or internal users only. Required before canary: Postgres, raw object storage, secret injection, deploy target access, error monitoring, metrics backend, alert routing, broadcaster/fanout integration, canary owner, canary reviewer, and rollback approver. Run `npm run bridge:canary:check` before promotion; it must report `ready: true`. Optional sources without credentials remain disabled and mocked.
