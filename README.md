# Solvol Terminal

Read-only intelligence terminal for Polymarket odds, flow, catalyst mapping, market discovery, alerts, timelines, and system status.

## What It Is

Solvol is a keyboard-first terminal for scanning Polymarket markets. The product foundation is read-only market intelligence, not trade execution:

- explicit terminal routes for Overview, Markets, Market Detail, Movement Scanner, Whale Tracker, Event Timeline, Alerts, Watchlist, and Data Sources / System Status
- live discovery lanes for hot, high-volume, closing-soon, and new markets
- dense market screener with sorting, filtering, watchlist pins, probability, move, volume, liquidity, close time, and score columns
- market snapshot with YES/NO pricing, volume, liquidity, close time, and history
- largest CLOB jump marker rendered directly on the YES price line
- public CLOB order book, spread, depth imbalance, and recent Data API trade tape
- deterministic movement scanner for probability jumps, volume anomalies, volatility, momentum, and threshold crossings
- wallet/whale tracker using public wallet/trade rows when available and clearly labeled demo rows when live data is unavailable
- CryptoPanic-style headline pulse matched to market terms
- catalyst explanation workflow for "why did this move?"
- market lens with derived microstructure and liquidity read
- flow alerts for repricing, volume spikes, and resolution pressure
- opportunity radar, sector pulse, compare strip, strategy deck, and resolution queue
- local watchlist, desk notes, command history, and workspace modes
- Supabase-ready research backend for saved workspaces, alerts, reports, and Source Ledger
- hybrid source engine with RSS, GDELT, Wikidata, CoinGecko, and optional FRED / Alpha Vantage enrichment
- `MarketSource` interfaces for Polymarket and deterministic demo/mock data
- local alert rule persistence and deterministic alert evaluation
- merged terminal timeline records for source events, market moves, wallet flow, and why-moved correlations
- Bloomberg-style dense terminal layout

## Terminal Routes

- `/terminal` and `/terminal/overview`
- `/terminal/markets`
- `/terminal/market/[id]`
- `/terminal/movement`
- `/terminal/whales`
- `/terminal/timeline`
- `/terminal/alerts`
- `/terminal/watchlist`
- `/terminal/status`

## Architecture

Core terminal data types live in `src/lib/terminal/types.ts`:

- `MarketSource`
- `Market`
- `MarketOutcome`
- `MarketPricePoint`
- `MarketMove`
- `WalletActivity`
- `EventItem`
- `AlertRule`
- `AlertEvent`

Deterministic scoring lives in `src/lib/terminal/scoring.ts` and covers volatility, momentum, unusual volume, whale conviction, market importance, move significance, and timestamp-based "why moved" correlation. Local alert evaluation lives in `src/lib/terminal/alerts.ts`; timeline merging lives in `src/lib/terminal/timeline.ts`. The real Polymarket adapter boundary is in `src/lib/terminal/polymarket-source.ts`; the seeded local fallback is in `src/lib/terminal/mock-source.ts`.

## Commands

Use the top command bar:

```text
HOT
VOL limit 60
CLS hours 48
NEW
MKT 540816
WHY 540816
BOOK current
TAPE current
NEWS current
WATCH 540816
UNWATCH 540816
WATCHLIST
MODE flow
MODE research
HELP
```

## Local Checks

```bash
npm run lint
npx tsc --noEmit
node --test --experimental-strip-types test/*.test.ts
npm run build
```

The build script uses webpack mode for reliability in restricted environments.

## Source Ingestion

Solvol can build a durable source memory in Supabase. The ingest worker scans hot, high-volume, and catalyst-rich markets, derives market terms, fetches source documents, and stores matched evidence in `source_documents` and `market_source_matches`.

Run locally against a dev server:

```bash
SOLVOL_INGEST_SECRET=dev-secret npm run dev
SOLVOL_INGEST_SECRET=dev-secret npm run ingest
```

Optional:

```bash
INGEST_LIMIT=12 npm run ingest
INGEST_URL=https://your-deployment.vercel.app npm run ingest
```

The Vercel cron in `vercel.json` calls `GET /api/internal/ingest` daily. Set `CRON_SECRET` or `SOLVOL_INGEST_SECRET` in Vercel so the route accepts scheduled runs. Pro deployments can raise the schedule frequency if needed.

## Public Polymarket Data

Solvol v1 stays read-only. It uses public Polymarket surfaces:

- Gamma API for market discovery and metadata
- CLOB API for midpoint, spread, order book, and price history
- Data API for public market trade tape
- RSS/GDELT/Wikidata/CoinGecko/FRED/Alpha Vantage source context

Official Polymarket docs describe Gamma, Data, and public CLOB market-data APIs as public/no-wallet read surfaces, while trading endpoints require authentication. Solvol only calls read endpoints. No wallet, custody, deposit, withdrawal, or order submission is wired into this terminal.

## Demo Fallback

The app runs without Supabase or external source credentials when `SUPABASE_REQUIRE_AUTH=false`. If public Polymarket/source calls fail, API routes return deterministic mock payloads with `dataMode: "mock"` and a `fallbackReason`.

Useful local smoke checks:

```bash
curl http://127.0.0.1:3000/api/market/not-a-real-market-id
curl http://127.0.0.1:3000/api/market/not-a-real-market-id/intel
```

Set `SOLVOL_DISABLE_MOCK_FALLBACK=true` to turn fallback responses into hard failures while debugging live adapters.

## Demo Instructions

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000/terminal`. The terminal starts in demo beta mode unless Supabase auth is configured and required.

## Vercel

This is a Next.js app. Vercel can deploy it directly from GitHub.

Full deployment handoff: `docs/vercel-supabase-deployment.md`.

Recommended production environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_REQUIRE_AUTH=true
SOLVOL_RAW_STORAGE_BUCKET=terminal-raw
SOLVOL_BRIDGE_REDIS_URL=
SOLVOL_BRIDGE_BROADCASTER_URL=
SOLVOL_ERROR_MONITORING_DSN=
SOLVOL_METRICS_DSN=
SOLVOL_ALERT_ROUTING_URL=
SOLVOL_DEPLOY_TARGET=vercel:solvol:production
SOLVOL_POSTGRES_BACKUP_VERIFIED=false
SOLVOL_SOURCE_POLICY_REVIEWED=false
SOLVOL_CANARY_OWNER=
SOLVOL_CANARY_REVIEWER=
SOLVOL_ROLLBACK_APPROVER=
SOLVOL_STAGING_SHADOW_SOAK_PASSED=false
SOLVOL_REPLAY_DETERMINISM_VERIFIED=false
SOLVOL_ANALYST_QA_APPROVED=false
SOLVOL_CANARY_WINDOW_PASSED=false
SOLVOL_NO_P1_P2_DEFECTS=false
OPENAI_API_KEY=
SNAPSHOT_CRON_SECRET=
SOLVOL_INGEST_SECRET=
CRON_SECRET=
FRED_API_KEY=
ALPHA_VANTAGE_API_KEY=
SQLITE_DISABLED=true
```

`OPENAI_API_KEY` is optional but enables richer server-side narration. `FRED_API_KEY` and `ALPHA_VANTAGE_API_KEY` are optional enrichers; missing keys are skipped cleanly. `SUPABASE_REQUIRE_AUTH=true` turns on invite-only beta protection for terminal pages and market/research APIs. `SQLITE_DISABLED=true` is recommended for serverless deploys unless a persistent database path is configured. Keep `SUPABASE_SERVICE_ROLE_KEY`, Redis/fanout URLs, DSNs, alert routes, and cron secrets server-only in Vercel project settings; do not commit real values to GitHub.

## Invite-Only Beta

Run `supabase/schema.sql` in Supabase, then configure auth redirect URLs for:

```text
http://localhost:3000/auth/callback
https://your-deployment.vercel.app/auth/callback
```

Seed beta invites manually in the Supabase SQL editor:

```sql
insert into public.beta_invites (email, notes)
values ('founder@example.com', 'initial beta seat')
on conflict (email) do update
set status = 'invited', notes = excluded.notes, updated_at = now();
```

Launch checklist:

- set all Supabase env vars in Vercel preview and production
- set `SUPABASE_REQUIRE_AUTH=true` before public sharing
- verify `/login`, `/waitlist`, `/auth/callback`, and `/terminal`
- confirm an invited email creates a `profiles` row with `plan = 'beta'`
- confirm an uninvited email creates/updates `waitlist_entries`
- confirm direct calls to private APIs return `401` or `403`
- monitor structured JSON logs for auth, waitlist, explain, research, and ingest routes

Remaining paid-launch blockers: Stripe checkout, billing portal, counsel-approved Terms/Privacy, hard rate limiting, and an analytics dashboard.
