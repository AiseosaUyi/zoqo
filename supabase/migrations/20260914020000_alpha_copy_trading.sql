-- ZOQO Alpha: copy trading (docs/alpha/08-copy-trading.md §6, added
-- 2026-09-14 mid-way through docs/alpha/PROMPT-alpha-finish.md — see that
-- doc for the full source-selection/replication/measurement design).
--
-- NOT YET APPLIED in this session — same gap as
-- supabase/migrations/20260914010000_alpha_vault_secrets.sql: no
-- SUPABASE_ACCESS_TOKEN / DB connection string to run `supabase db push
-- --linked` from this environment (see docs/alpha/STATUS.md's Needs Aise
-- list). Code built against this schema is committed but unexercised
-- against live tables until this lands.

create table alpha_copy_sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  venue         text not null,
  source_ref    text not null,               -- wallet address or username
  label         text,
  status        text not null check (status in ('candidate','followed','dropped','blocked')) default 'candidate',
  score         numeric(8,4),
  metrics       jsonb not null default '{}', -- n, brier, clv, pf, dd, consistency, copyability, correlation
  first_seen    timestamptz not null default now(),
  followed_since timestamptz,
  dropped_at    timestamptz,
  unique (user_id, venue, source_ref)
);

create table alpha_source_fills (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references alpha_copy_sources(id) on delete cascade,
  venue_trade_id text not null,
  market_id     text not null,
  outcome_id    text,
  side          text not null,
  price         numeric(20,8) not null,
  size          numeric(20,8) not null,
  filled_at     timestamptz not null,
  detected_at   timestamptz not null default now(),
  features      jsonb,
  unique (source_id, venue_trade_id)
);

alter table alpha_decisions add column source_id uuid references alpha_copy_sources(id);
alter table alpha_decisions add column lag_ms int;
alter table alpha_decisions add column slippage_bps numeric(10,4);

create index alpha_copy_sources_user_venue_idx on alpha_copy_sources(user_id, venue, status);
create index alpha_source_fills_source_idx on alpha_source_fills(source_id, filled_at desc);

-- RLS: own rows only, same pattern as every other alpha_* table.
alter table alpha_copy_sources enable row level security;
alter table alpha_source_fills enable row level security;

create policy "own rows only" on alpha_copy_sources for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- alpha_source_fills has no user_id of its own (it belongs to a source,
-- which belongs to a user) — same "join through the owning row" pattern
-- service.ts already uses for alpha_orders/alpha_decisions style checks.
create policy "own rows only via source" on alpha_source_fills for all
  using (exists (select 1 from alpha_copy_sources s where s.id = alpha_source_fills.source_id and s.user_id = auth.uid()))
  with check (exists (select 1 from alpha_copy_sources s where s.id = alpha_source_fills.source_id and s.user_id = auth.uid()));
