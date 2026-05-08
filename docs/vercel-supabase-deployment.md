# Vercel and Supabase Deployment Handoff

Solvol Terminal stays read-only. Production setup must only enable public market/source reads, normalized persistence, raw replay storage, observability, and operator rollback gates. Do not add wallet, custody, deposit, withdrawal, or order placement credentials.

## Current Status

- The app is a linked Vercel Next.js project named `solvol`.
- `vercel.json` runs `npm ci`, `npm run build`, and a production cron for `/api/internal/ingest`.
- `.env*` and `.vercel/` are ignored so secrets stay out of GitHub.
- `supabase/schema.sql` provisions the app tables, private `terminal-raw` Storage bucket, RLS policies, and explicit `service_role` Data API grants.
- `npm run bridge:canary:check` is the promotion gate for Supabase, raw storage, fanout, observability, alert routing, deploy target, backup verification, source policy review, canary ownership, review, and rollback approval.
- `npm run bridge:canary:env-template` emits read-only, shell-safe templates for missing handoff inputs. Use the primary `template` for production-canary and pre-canary Vercel values, and use `generalRolloutTemplate` only after canary when public rollout gates are being reviewed; do not commit populated secrets.

## Access Prerequisites

Before configuring canary values, confirm the operator has access to the Vercel team that owns the linked `solvol` project and can edit Vercel project settings for Production and the Preview environment used for staging. The operator also needs Supabase project admin access, including the project URL, publishable browser key, server-only service role key, private Storage bucket controls, SQL editor or migration permissions, backup verification evidence, and Auth redirect configuration.

The same handoff must identify owners for observability, metrics, alert routing, source policy approval, canary review, and rollback approver signoff. If project/team access is missing, stop before entering placeholder values and restore access first; `npm run bridge:canary:check` must continue reporting `ready: false` until these external prerequisites are satisfied in the target environment.

## Supabase Setup

1. Create or select the Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor before enabling cloud persistence.
3. Confirm the `terminal-raw` bucket is private and `SOLVOL_RAW_STORAGE_BUCKET=terminal-raw`.
4. Configure Auth redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://<production-domain>/auth/callback`
   - any Vercel preview callback domain used for invite testing
5. Verify Security Advisor and backup status in Supabase, then set `SOLVOL_POSTGRES_BACKUP_VERIFIED=true` only after a restore path has been checked.
6. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. It must never use a `NEXT_PUBLIC_` prefix.

Supabase changed Data API exposure defaults in 2026, so schema changes must bundle explicit grants with RLS. Solvol grants table access to `service_role` only because app reads and writes Supabase data through server-side routes.

## Vercel Environment Matrix

Set these in Vercel Project Settings for Production and the Preview environment used for staging. Use Vercel secrets/encrypted variables for every value except the `NEXT_PUBLIC_*` publishable config.

| Variable | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL for browser auth. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase publishable key for browser auth. |
| `SUPABASE_URL` | server | Same project URL for server-side Data API and Storage calls. |
| `SUPABASE_SERVICE_ROLE_KEY` | server secret | Server-only Supabase service role key. |
| `SUPABASE_REQUIRE_AUTH` | server | Set `true` before public sharing. |
| `SOLVOL_RAW_STORAGE_BUCKET` | server | Use `terminal-raw` unless the schema bucket is renamed. |
| `SOLVOL_BRIDGE_REDIS_URL` or `SOLVOL_BRIDGE_BROADCASTER_URL` | server secret | Required before production canary for durable fanout beyond local SSE fallback. |
| `SOLVOL_ERROR_MONITORING_DSN` | server secret | Error monitoring destination. |
| `SOLVOL_METRICS_DSN` | server secret | Metrics backend for source lag, DLQ, replay, and fanout dashboards. |
| `SOLVOL_ALERT_ROUTING_URL` | server secret | Alert route for source failure, rate-limit, DLQ, replay, and fanout incidents. |
| `SOLVOL_DEPLOY_TARGET` | server | Example: `vercel:solvol:production`. |
| `SOLVOL_POSTGRES_BACKUP_VERIFIED` | server | Set `true` only after backup/restore verification. |
| `SOLVOL_SOURCE_POLICY_REVIEWED` | server | Set `true` only after source-policy review. |
| `SOLVOL_CANARY_OWNER` | server | Accountable canary owner email or team handle. |
| `SOLVOL_CANARY_REVIEWER` | server | Reviewer accountable for canary evidence and rollout signoff. |
| `SOLVOL_ROLLBACK_APPROVER` | server | Approver for rollback decisions. |
| `SOLVOL_STAGING_SHADOW_SOAK_PASSED` | server | Staging promotion gate. |
| `SOLVOL_REPLAY_DETERMINISM_VERIFIED` | server | Staging promotion gate. |
| `SOLVOL_ANALYST_QA_APPROVED` | server | Staging promotion gate. |
| `SOLVOL_CANARY_WINDOW_PASSED` | server | General rollout gate after canary. |
| `SOLVOL_NO_P1_P2_DEFECTS` | server | General rollout gate after canary. |
| `SOLVOL_INGEST_SECRET`, `SNAPSHOT_CRON_SECRET`, `CRON_SECRET` | server secrets | Cron/API guard secrets. |
| `SQLITE_DISABLED` | server | Set `true` on Vercel unless persistent SQLite storage is intentionally configured. |

Optional source credentials and source flags stay disabled until the source-policy catalog approves them. Keep commercial news, social, and on-chain credentials server-only.

Generate the current missing-input checklist before entering values. The command output keeps production-canary inputs in `canaryEnvTemplate.template`, post-canary public rollout gates in `canaryEnvTemplate.generalRolloutTemplate`, and operator access requirements in `canaryEnvTemplate.accessPrerequisites`.

```bash
npm run bridge:canary:env-template
```

The checked-in `docs/production-canary.env.template` mirrors that handoff with placeholders only. Use the template as an operator checklist for Vercel Project Settings or a secure vault, but do not commit populated values.

## Deployment Verification

Before marking the foundation ready, run:

```bash
npm run lint
npx tsc --noEmit
node --test --experimental-strip-types test/*.test.ts
npm run build
npm run bridge:canary:check
npm run bridge:audit
git diff --check
```

For Vercel parity, run a production build with Vercel-provided production env after the project variables are configured:

```bash
vercel env run -e production -- npm run build
```

The product foundation is ready for canary only when `npm run bridge:canary:check` reports `ready: true`, `npm run bridge:audit` has no remaining unverified objective requirement beyond target-environment inputs, and `git diff --check` is clean. Until then, `/terminal` remains demoable through deterministic fallback.

## GitHub Upload Checklist

- Confirm `.env*`, `.vercel/`, local SQLite data, build output, and test output remain ignored.
- Do not commit real Supabase, Redis, observability, alert, or cron secrets.
- Commit `supabase/schema.sql`, docs, tests, and app code only.
- Push to the GitHub remote after local verification passes.
