# Solvol Terminal

Prediction market terminal for Polymarket-style odds, flow, catalyst mapping, and market discovery.

## What It Is

Solvol is a keyboard-first terminal for scanning prediction markets:

- live discovery lanes for hot, high-volume, closing-soon, and new markets
- market snapshot with YES/NO pricing, volume, liquidity, close time, and history
- catalyst explanation workflow for "why did this move?"
- market lens with derived microstructure and liquidity read
- flow alerts for repricing, volume spikes, and resolution pressure
- opportunity radar, sector pulse, compare strip, strategy deck, and resolution queue
- local watchlist, desk notes, command history, and workspace modes
- Supabase-ready research backend for saved workspaces, alerts, reports, and Source Ledger
- Bloomberg-style dense terminal layout

## Commands

Use the top command bar:

```text
HOT
VOL limit 60
CLS hours 48
NEW
MKT 540816
WHY 540816
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
npm run build
```

The build script uses webpack mode for reliability in restricted environments.

## Vercel

This is a Next.js app. Vercel can deploy it directly from GitHub.

Recommended environment variables:

```text
OPENAI_API_KEY=
SNAPSHOT_CRON_SECRET=
SQLITE_DISABLED=true
```

`OPENAI_API_KEY` is optional but enables richer server-side narration. `SQLITE_DISABLED=true` is recommended for serverless deploys unless a persistent database path is configured.

## Research Cloud

Run `supabase/schema.sql` in Supabase, then configure:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_REQUIRE_AUTH=false
```

The research APIs work in demo mode without Supabase, then persist to Supabase once configured.
