-- Solvol research backend schema.
-- Run this in Supabase SQL editor before enabling cloud workspaces.

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  provider text not null default 'vercel',
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'free',
  plan text not null default 'free',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  name text not null default 'Research Desk',
  market_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_markets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  market_id text not null,
  market_title text,
  folder text not null default 'Inbox',
  tags text[] not null default '{}',
  thesis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, market_id)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  market_id text,
  title text not null default 'Desk note',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  market_id text,
  name text not null,
  kind text not null check (kind in ('price_move', 'volume_spike', 'deadline_risk', 'new_related_market', 'catalyst_confidence', 'watched_market')),
  threshold numeric,
  channel text not null default 'in_app_email',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid references public.alerts(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  market_id text,
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.catalyst_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  market_id text not null,
  market_title text not null,
  confidence integer not null,
  confidence_band text not null,
  move_percent numeric not null,
  explanation text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.source_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  catalyst_run_id uuid references public.catalyst_runs(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  market_id text not null,
  source_type text not null,
  title text not null,
  url text,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  entity_matches text[] not null default '{}',
  confidence integer not null default 0,
  direction text not null default 'unclear',
  evidence text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  name text not null,
  lane text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  title text not null,
  market_ids text[] not null default '{}',
  body_md text not null default '',
  share_token text unique default encode(gen_random_bytes(18), 'hex'),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  name text not null default 'Default terminal',
  layout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

alter table public.profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.saved_markets enable row level security;
alter table public.notes enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_events enable row level security;
alter table public.catalyst_runs enable row level security;
alter table public.source_ledger_entries enable row level security;
alter table public.saved_scans enable row level security;
alter table public.reports enable row level security;
alter table public.workspace_layouts enable row level security;

create policy "profiles own read" on public.profiles for select using (auth.uid() = id);
create policy "profiles own update" on public.profiles for update using (auth.uid() = id);

create policy "watchlists own" on public.watchlists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saved markets own" on public.saved_markets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notes own" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "alerts own" on public.alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "alert events own" on public.alert_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "catalyst own" on public.catalyst_runs for all using (auth.uid() = user_id or user_id is null) with check (auth.uid() = user_id or user_id is null);
create policy "ledger own" on public.source_ledger_entries for all using (auth.uid() = user_id or user_id is null) with check (auth.uid() = user_id or user_id is null);
create policy "saved scans own" on public.saved_scans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reports own" on public.reports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public reports readable" on public.reports for select using (is_public = true or auth.uid() = user_id);
create policy "workspace own" on public.workspace_layouts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
