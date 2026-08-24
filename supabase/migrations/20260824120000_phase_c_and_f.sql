-- Phase C (automations real data model + trigger evaluator + MCP server) and
-- Phase F (email digest) schema additions. See PHASE_C_HANDOFF.md and the
-- plan this session worked from (src/lib/automations.ts's Automation type,
-- src/app/api/cron/evaluate-triggers/route.ts, src/app/api/mcp/route.ts,
-- src/app/api/cron/daily-digest/route.ts).

-- C1: automations gain real structured condition/action fields, replacing
-- the free-text `rule` as the source of truth (rule stays as a *derived*
-- display sentence, computed client-side at create/update time).
alter table automations
  add column symbol text,
  add column condition_type text,
  add column condition jsonb,
  add column action jsonb;
alter table automations
  add constraint automations_condition_type_check
    check (condition_type is null or condition_type in ('price-cross', 'pct-change', 'ma-cross'));
alter table automations alter column cooldown_label drop not null;
alter table automations alter column executions_label drop not null;
-- Nullable rather than NOT NULL: avoids failing this migration against any
-- pre-existing (mocked, pre-Phase-C) row. The app always populates these on
-- new creates going forward; the evaluator (C2) simply skips any enabled
-- automation missing them rather than treating it as a data-integrity error.

alter table automation_triggers
  add column executions_count int not null default 0;

-- C2: self-built price history — backs pct-change/ma-cross conditions (no
-- per-asset historical-candle source exists today outside BTC) and doubles
-- as a rate-limit-friendly cache for forex/gold, whose upstream (TwelveData)
-- free tier is 800 req/day, well under what a literal per-minute fetch
-- across 4 assets would need. Not user-owned data — no RLS; only the
-- service-role cron evaluator ever reads/writes this table.
create table price_history (
  asset_id text not null,
  price numeric not null,
  ts timestamptz not null default now()
);
create index price_history_asset_ts_idx on price_history(asset_id, ts desc);

-- C3: per-user API keys for the Zoqo MCP server (spec §7). Raw key is shown
-- once at creation and never stored — only its hash + a short prefix (for
-- display/identification) persist.
create table api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  key_hash      text not null unique,
  key_prefix    text not null,
  scope         text not null check (scope in ('read', 'trade')),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
alter table api_keys enable row level security;
create policy "own row only" on api_keys for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Phase F: daily/weekly email digest.
alter table profiles add column digest_opt_in boolean not null default true;

-- Snapshot of each day's real numbers, written once by the digest cron right
-- before sending, so "yesterday vs. today" is a real diff (not recomputed
-- and potentially drifting on a resend) and a retry is naturally idempotent.
create table daily_stats_snapshot (
  user_id             uuid not null references auth.users(id) on delete cascade,
  day                 date not null,
  xp                  int not null default 0,
  lessons_completed   int not null default 0,
  pnl                 numeric(14,2) not null default 0,
  primary key (user_id, day)
);
alter table daily_stats_snapshot enable row level security;
create policy "own row only" on daily_stats_snapshot for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
