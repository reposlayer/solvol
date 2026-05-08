-- Solvol research backend schema.
-- Run this in Supabase SQL editor before enabling cloud workspaces.

create extension if not exists pgcrypto;
create extension if not exists citext;

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
  plan text not null default 'free' check (plan in ('free', 'beta', 'pro', 'team')),
  team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'beta', 'pro', 'team')) not valid;
alter table public.profiles validate constraint profiles_plan_check;

create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  status text not null default 'invited' check (status in ('invited', 'accepted', 'revoked')),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text,
  use_case text,
  status text not null default 'pending' check (status in ('pending', 'invited', 'rejected')),
  source text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_beta_invites_email_lower on public.beta_invites (lower(email::text));
create index if not exists idx_beta_invites_status on public.beta_invites (status);
create index if not exists idx_waitlist_entries_email_lower on public.waitlist_entries (lower(email::text));
create index if not exists idx_waitlist_entries_status on public.waitlist_entries (status);

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

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('rss', 'gdelt', 'coingecko', 'wikidata', 'fred', 'alpha_vantage')),
  external_id text not null,
  title text not null,
  url text,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  summary text,
  category text not null check (category in ('news', 'event_graph', 'poll', 'price_feed', 'macro', 'entity_context', 'sportsbook', 'social', 'onchain')),
  matched_terms text[] not null default '{}',
  reliability numeric not null default 0.5,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_id)
);

create table if not exists public.market_source_matches (
  id uuid primary key default gen_random_uuid(),
  market_id text not null,
  provider text not null,
  document_external_id text not null,
  relevance_score numeric not null default 0,
  matched_terms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(market_id, provider, document_external_id),
  foreign key (provider, document_external_id) references public.source_documents(provider, external_id) on delete cascade
);

create table if not exists public.source_registry (
  source_id text primary key,
  source_class text not null check (source_class in ('market', 'official', 'news_api', 'rss', 'social', 'onchain', 'factcheck')),
  label text not null,
  enabled boolean not null default true,
  read_only boolean not null default true,
  priority integer not null default 100,
  poll_interval_sec integer not null default 300,
  adapter_version text not null,
  base_url text,
  rate_limit_per_minute integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (read_only = true)
);

create table if not exists public.source_cursor (
  source_id text primary key references public.source_registry(source_id) on delete cascade,
  cursor_json jsonb not null default '{}'::jsonb,
  etag text,
  last_modified text,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_http_status integer,
  rate_limit_remaining integer,
  rate_limit_reset_at timestamptz,
  consecutive_failures integer not null default 0,
  items_fetched_last_run integer,
  items_accepted_last_run integer,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.source_cursor add column if not exists last_http_status integer;
alter table public.source_cursor add column if not exists rate_limit_remaining integer;
alter table public.source_cursor add column if not exists rate_limit_reset_at timestamptz;
alter table public.source_cursor add column if not exists items_fetched_last_run integer;
alter table public.source_cursor add column if not exists items_accepted_last_run integer;
alter table public.source_cursor add column if not exists last_error text;

create table if not exists public.raw_document (
  id text primary key,
  source_id text not null references public.source_registry(source_id) on delete restrict,
  source_class text not null check (source_class in ('market', 'official', 'news_api', 'rss', 'social', 'onchain', 'factcheck')),
  external_id text not null,
  raw_blob_key text not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  fetched_at timestamptz not null,
  published_at timestamptz,
  adapter_version text not null,
  byte_length integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(source_id, external_id),
  unique(raw_blob_key),
  unique(checksum_sha256)
);

create table if not exists public.news_item (
  id text primary key,
  source_id text not null references public.source_registry(source_id) on delete restrict,
  source_class text not null check (source_class in ('market', 'official', 'news_api', 'rss', 'social', 'onchain', 'factcheck')),
  external_id text not null,
  headline text not null,
  body text,
  summary text,
  canonical_url text,
  source_url text,
  author text,
  publisher_name text,
  publisher_domain text,
  language text,
  country_code text,
  published_at timestamptz,
  observed_at timestamptz not null,
  occurred_at timestamptz,
  categories text[] not null default '{}',
  topics text[] not null default '{}',
  entities_json jsonb not null default '[]'::jsonb,
  geo_json jsonb not null default '[]'::jsonb,
  sentiment_json jsonb not null default '{}'::jsonb,
  credibility_json jsonb not null default '{}'::jsonb,
  dedupe_fingerprint text not null,
  provenance_json jsonb not null default '[]'::jsonb,
  jsonb_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id, external_id)
);

create table if not exists public.event_cluster (
  id text primary key,
  cluster_key text not null unique,
  kind text not null,
  title text not null,
  abstract text not null,
  occurred_at timestamptz,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  time_precision text not null default 'unknown' check (time_precision in ('minute', 'hour', 'day', 'unknown')),
  source_count integer not null default 1,
  source_mix text[] not null default '{}',
  primary_entities_json jsonb not null default '[]'::jsonb,
  geo_json jsonb not null default '[]'::jsonb,
  topics text[] not null default '{}',
  sentiment_json jsonb not null default '{}'::jsonb,
  credibility_score numeric not null default 0,
  credibility_json jsonb not null default '{}'::jsonb,
  source_diversity_score numeric not null default 0,
  novelty_score numeric not null default 0,
  lifecycle_status text not null default 'new' check (lifecycle_status in ('new', 'developing', 'corroborated', 'contested', 'refuted')),
  rumor_status text not null default 'not_rumor' check (rumor_status in ('not_rumor', 'unverified', 'corroborated', 'contested', 'refuted')),
  contradictions_json jsonb not null default '[]'::jsonb,
  text_signature_json jsonb not null default '{}'::jsonb,
  timeline_json jsonb not null default '[]'::jsonb,
  representative_news_item_id text references public.news_item(id) on delete set null,
  provenance_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_cluster add column if not exists timeline_json jsonb not null default '[]'::jsonb;

create table if not exists public.event_cluster_member (
  event_id text not null references public.event_cluster(id) on delete cascade,
  news_item_id text not null references public.news_item(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, news_item_id)
);

create table if not exists public.entity_catalog (
  id text primary key,
  kind text not null,
  canonical_name text not null,
  aliases text[] not null default '{}',
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(kind, canonical_name)
);

create table if not exists public.market_registry (
  market_id text primary key,
  slug text unique,
  event_slug text,
  question text not null,
  category text,
  entities_json jsonb not null default '[]'::jsonb,
  resolution_source text,
  start_date timestamptz,
  end_date timestamptz,
  status text not null default 'open',
  liquidity numeric not null default 0,
  volume numeric not null default 0,
  url text,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.market_registry add column if not exists entities_json jsonb not null default '[]'::jsonb;

create table if not exists public.market_price (
  market_id text not null references public.market_registry(market_id) on delete cascade,
  ts timestamptz not null,
  price_yes numeric,
  price_no numeric,
  source text not null default 'polymarket-public',
  volume numeric,
  created_at timestamptz not null default now(),
  primary key (market_id, ts, source)
);

create table if not exists public.why_moved_candidate (
  id text primary key,
  market_id text not null references public.market_registry(market_id) on delete cascade,
  event_id text not null references public.event_cluster(id) on delete cascade,
  move_id text not null,
  direction text not null check (direction in ('yes', 'no', 'unclear')),
  evidence_status text not null default 'supported' check (evidence_status in ('supported', 'insufficient_evidence', 'contradicted', 'divergent_market')),
  confidence numeric not null default 0,
  event_market_link_json jsonb not null default '{}'::jsonb,
  score_breakdown_json jsonb not null,
  move_quality_json jsonb not null default '{}'::jsonb,
  market_divergence_json jsonb not null default '{}'::jsonb,
  observed_price_move_json jsonb,
  reasons text[] not null default '{}',
  rule_ids text[] not null default '{}',
  supporting_news_item_ids text[] not null default '{}',
  conflicting_news_item_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.why_moved_candidate add column if not exists move_id text;
alter table public.why_moved_candidate add column if not exists event_market_link_json jsonb not null default '{}'::jsonb;
update public.why_moved_candidate set move_id = id where move_id is null;
alter table public.why_moved_candidate alter column move_id set not null;
alter table public.why_moved_candidate drop constraint if exists why_moved_candidate_market_id_event_id_key;
create unique index if not exists idx_why_moved_candidate_market_event_move
  on public.why_moved_candidate(market_id, event_id, move_id);

create table if not exists public.delivery_outbox (
  seq bigserial primary key,
  topic text not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Raw payload bodies are private and written only by server-side service-role ingestion.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('terminal-raw', 'terminal-raw', false, 10485760, array['application/json'])
on conflict (id) do update
  set name = excluded.name,
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create index if not exists idx_source_documents_provider_category on public.source_documents(provider, category);
create index if not exists idx_source_documents_published_at on public.source_documents(published_at desc);
create index if not exists idx_market_source_matches_market on public.market_source_matches(market_id);
create index if not exists idx_source_cursor_updated on public.source_cursor(updated_at desc);
create index if not exists idx_raw_document_source_fetched on public.raw_document(source_id, fetched_at desc);
create index if not exists idx_news_item_published_at on public.news_item(published_at desc);
create index if not exists idx_news_item_payload on public.news_item using gin(jsonb_payload);
create index if not exists idx_event_cluster_occurred_at on public.event_cluster(occurred_at desc);
create index if not exists idx_event_cluster_topics on public.event_cluster using gin(topics);
create index if not exists idx_entity_catalog_aliases on public.entity_catalog using gin(aliases);
create index if not exists idx_market_registry_question_fts on public.market_registry using gin(to_tsvector('english', coalesce(question, '') || ' ' || coalesce(slug, '')));
create index if not exists idx_market_price_market_ts on public.market_price(market_id, ts desc);
create index if not exists idx_why_moved_candidate_market_confidence on public.why_moved_candidate(market_id, confidence desc, created_at desc);
create index if not exists idx_delivery_outbox_topic_seq on public.delivery_outbox(topic, seq);

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
alter table public.teams enable row level security;
alter table public.beta_invites enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.subscriptions enable row level security;
alter table public.watchlists enable row level security;
alter table public.saved_markets enable row level security;
alter table public.notes enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_events enable row level security;
alter table public.catalyst_runs enable row level security;
alter table public.source_ledger_entries enable row level security;
alter table public.source_documents enable row level security;
alter table public.market_source_matches enable row level security;
alter table public.source_registry enable row level security;
alter table public.source_cursor enable row level security;
alter table public.raw_document enable row level security;
alter table public.news_item enable row level security;
alter table public.event_cluster enable row level security;
alter table public.event_cluster_member enable row level security;
alter table public.entity_catalog enable row level security;
alter table public.market_registry enable row level security;
alter table public.market_price enable row level security;
alter table public.why_moved_candidate enable row level security;
alter table public.delivery_outbox enable row level security;
alter table public.saved_scans enable row level security;
alter table public.reports enable row level security;
alter table public.workspace_layouts enable row level security;

create policy "profiles own read" on public.profiles for select using (auth.uid() = id);
create policy "profiles own update" on public.profiles for update using (auth.uid() = id);
create policy "teams own read" on public.teams
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.team_id = teams.id
    )
  );
create policy "subscriptions own read" on public.subscriptions
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.team_id = subscriptions.team_id
    )
  );

create policy "beta invites own email read" on public.beta_invites
  for select using (lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "waitlist own email read" on public.waitlist_entries
  for select using (lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "watchlists own" on public.watchlists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saved markets own" on public.saved_markets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notes own" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "alerts own" on public.alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "alert events own" on public.alert_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "catalyst own" on public.catalyst_runs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ledger own" on public.source_ledger_entries for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "source documents service readable" on public.source_documents;
drop policy if exists "source matches service readable" on public.market_source_matches;
drop policy if exists "source registry readable" on public.source_registry;
drop policy if exists "source registry service readable" on public.source_registry;
drop policy if exists "news item readable" on public.news_item;
drop policy if exists "news item service readable" on public.news_item;
drop policy if exists "event cluster readable" on public.event_cluster;
drop policy if exists "event cluster service readable" on public.event_cluster;
drop policy if exists "event cluster member readable" on public.event_cluster_member;
drop policy if exists "event cluster member service readable" on public.event_cluster_member;
drop policy if exists "entity catalog readable" on public.entity_catalog;
drop policy if exists "entity catalog service readable" on public.entity_catalog;
drop policy if exists "market registry readable" on public.market_registry;
drop policy if exists "market registry service readable" on public.market_registry;
drop policy if exists "market price readable" on public.market_price;
drop policy if exists "market price service readable" on public.market_price;
drop policy if exists "why moved candidate readable" on public.why_moved_candidate;
drop policy if exists "why moved candidate service readable" on public.why_moved_candidate;
create policy "source documents service readable" on public.source_documents for select to service_role using (true);
create policy "source matches service readable" on public.market_source_matches for select to service_role using (true);
create policy "source registry service readable" on public.source_registry for select to service_role using (true);
drop policy if exists "source cursor readable" on public.source_cursor;
drop policy if exists "raw document metadata readable" on public.raw_document;
drop policy if exists "delivery outbox readable" on public.delivery_outbox;
drop policy if exists "source cursor service readable" on public.source_cursor;
drop policy if exists "raw document metadata service readable" on public.raw_document;
drop policy if exists "delivery outbox service readable" on public.delivery_outbox;
create policy "source cursor service readable" on public.source_cursor for select to service_role using (true);
create policy "raw document metadata service readable" on public.raw_document for select to service_role using (true);
create policy "news item service readable" on public.news_item for select to service_role using (true);
create policy "event cluster service readable" on public.event_cluster for select to service_role using (true);
create policy "event cluster member service readable" on public.event_cluster_member for select to service_role using (true);
create policy "entity catalog service readable" on public.entity_catalog for select to service_role using (true);
create policy "market registry service readable" on public.market_registry for select to service_role using (true);
create policy "market price service readable" on public.market_price for select to service_role using (true);
create policy "why moved candidate service readable" on public.why_moved_candidate for select to service_role using (true);
create policy "delivery outbox service readable" on public.delivery_outbox for select to service_role using (true);
create policy "terminal raw payload service insert" on storage.objects
  for insert to service_role
  with check (
    bucket_id = 'terminal-raw'
    and name like 'raw/%'
  );
create policy "terminal raw payload service read" on storage.objects
  for select to service_role
  using (
    bucket_id = 'terminal-raw'
    and name like 'raw/%'
  );
create policy "saved scans own" on public.saved_scans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reports own" on public.reports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public reports readable" on public.reports for select using (is_public = true or auth.uid() = user_id);
create policy "workspace own" on public.workspace_layouts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Supabase Data API exposure is now explicit on new projects. Solvol keeps
-- terminal writes server-only, so only service_role receives table access.
grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.teams,
  public.profiles,
  public.beta_invites,
  public.waitlist_entries,
  public.subscriptions,
  public.watchlists,
  public.saved_markets,
  public.notes,
  public.alerts,
  public.alert_events,
  public.catalyst_runs,
  public.source_ledger_entries,
  public.source_documents,
  public.market_source_matches,
  public.source_registry,
  public.source_cursor,
  public.raw_document,
  public.news_item,
  public.event_cluster,
  public.event_cluster_member,
  public.entity_catalog,
  public.market_registry,
  public.market_price,
  public.why_moved_candidate,
  public.delivery_outbox,
  public.saved_scans,
  public.reports,
  public.workspace_layouts
to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
