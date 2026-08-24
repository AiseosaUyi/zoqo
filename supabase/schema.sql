-- ZOQO backend schema (TERMINAL_SPEC.md §2, Phase B of the roadmap).
--
-- Not run against anything yet — there is no live Supabase project. This is
-- plain text, ready for whoever creates that project (see the plan file:
-- /Users/aiseosauyi-idahor/.claude/plans/radiant-purring-cake.md, Phase B
-- step 2, "needs you directly") to paste into the SQL editor, or run via
-- `supabase db push` once the Supabase CLI is linked to a real project.
--
-- Column shapes are pulled directly from the real client types this
-- replaces (src/lib/types.ts's Position/OpenOrder/HistoryEntry,
-- src/lib/terminalStore.tsx's TerminalPosition/TerminalHistoryEntry,
-- src/lib/profile.tsx's ProfileState, src/lib/academy.ts's AcademyState,
-- src/lib/automations.ts's Automation) — see src/lib/dataStore.ts for the
-- TypeScript side of this same shape.

-- One row per auth.users row (Supabase Auth owns auth.users itself).
create table profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  handle          text,
  email           text,
  avatar_seed     text not null default 'trader',
  streak          int not null default 0,
  best_streak     int not null default 0,
  last_claim_day  date,
  claims          int not null default 0,
  created_at      timestamptz not null default now()
);

create table wallets (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  cash            numeric(14,2) not null default 0,
  deposit_count   int not null default 0,
  next_deposit_at timestamptz,
  trades_placed   int not null default 0,
  wins            int not null default 0,
  losses          int not null default 0,
  best_pnl        numeric(14,2) not null default 0,
  updated_at      timestamptz not null default now()
);

-- Prediction-market positions (types.ts Position) and terminal positions
-- (terminalStore.tsx TerminalPosition) share one table via `kind` — both are
-- "an open position owned by a user," and near-identical shapes as two
-- separate tables would drift the way the two client-side stores already
-- once threatened to.
create table positions (
  id            text primary key,          -- client-generated id, kept stable across migration
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('prediction', 'terminal')),
  market_id     text,                       -- prediction only (Position.marketId)
  asset_id      text,                       -- terminal only (TerminalPosition.assetId)
  side          text not null,              -- 'up'/'down' (prediction) or 'long'/'short' (terminal)
  qty           numeric(20,8) not null,      -- Position.shares or TerminalPosition.qty
  avg_price     numeric(20,8) not null,      -- Position.avgPrice (cents) or TerminalPosition.entryPrice
  cost          numeric(14,2),               -- prediction only (Position.cost)
  stop_loss     numeric(20,8),               -- terminal only
  take_profit   numeric(20,8),               -- terminal only
  opened_at     timestamptz not null
);
create index positions_user_kind_idx on positions(user_id, kind);

-- Prediction-market open limit orders (types.ts OpenOrder) — userPlaced only,
-- same subset store.tsx persists to localStorage today. The terminal has no
-- resting-order concept (market orders only), so this table stays
-- prediction-only, unlike positions/trade_history above/below.
create table open_orders (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  market_id     text not null,
  label         text not null,
  strike        numeric not null,
  side          text not null,
  shares        numeric not null,
  limit_price   numeric not null,
  filled_pct    numeric not null default 0,
  placed_at     timestamptz not null,
  status        text not null              -- 'working' | 'partial'
);

-- Closed/settled trades — both HistoryEntry (prediction) and
-- TerminalHistoryEntry (terminal) share this table the same way positions
-- does above.
create table trade_history (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('prediction', 'terminal')),
  market_id     text,
  label         text,                       -- prediction only
  strike        numeric,                     -- prediction only
  asset_id      text,                        -- terminal only
  side          text not null,
  qty           numeric(20,8) not null,
  entry_price   numeric(20,8) not null,
  exit_price    numeric(20,8) not null,
  close_price   numeric(20,8),               -- prediction only, HistoryEntry.closePrice
  pnl           numeric(14,2) not null,
  result        text,                        -- prediction only: 'won' | 'lost' | 'closed'
  opened_at     timestamptz,                  -- terminal only
  closed_at     timestamptz not null
);
create index trade_history_user_closed_idx on trade_history(user_id, closed_at desc);

create table academy_progress (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  xp                  int not null default 0,
  hearts              int not null default 5,
  last_heart_lost_at  timestamptz,
  streak              int not null default 0,
  last_lesson_day     date,
  completed_lessons   text[] not null default '{}'
);

create table automations (
  id                text primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  template_key      text not null,
  category          text not null,
  rule              text not null,
  cooldown_label    text,
  executions_label  text,
  enabled           boolean not null default true,
  max_order_size    numeric(14,2) not null,   -- Phase C hook: server-enforced ceiling, required from day one
  daily_cap         numeric(14,2) not null,
  created_at        timestamptz not null default now()
);

-- Evaluator-written state, split from `automations` above so the Vercel Cron
-- job (Phase C) writing this on a totally different cadence than a user
-- editing name/rule/enabled never races that edit.
create table automation_triggers (
  automation_id         text primary key references automations(id) on delete cascade,
  last_triggered_at     timestamptz,
  spent_today           numeric(14,2) not null default 0,
  spent_today_reset_at  timestamptz not null default now(),
  last_evaluated_at     timestamptz
);

-- Phase G prep only (spec §9 Phase 5) — NOT wired to anything live. Shape
-- exists now so a future encrypted-credential store doesn't force a schema
-- rewrite; `secret_ref` is an opaque pointer into a real secrets manager
-- (Vercel env / Supabase Vault), never the secret itself.
create table broker_credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  broker        text not null,
  scope         text not null default 'read',  -- 'read' | 'trade', mirrors the MCP key scoping in spec §7
  secret_ref    text not null,
  created_at    timestamptz not null default now()
);

-- Real leaderboard — first time this app has one across actual users
-- rather than a seeded/deterministic per-browser illusion of one.
create view leaderboard_pnl as
  select w.user_id, p.handle, w.cash, w.trades_placed, w.wins, w.losses
  from wallets w
  join profiles p using (user_id);

-- Row Level Security: every table above, one policy each. This is the
-- first time ZOQO is genuinely multi-user with a shared leaderboard, so a
-- gap here directly means one family member reading another's wallet.
alter table profiles enable row level security;
alter table wallets enable row level security;
alter table positions enable row level security;
alter table open_orders enable row level security;
alter table trade_history enable row level security;
alter table academy_progress enable row level security;
alter table automations enable row level security;
alter table broker_credentials enable row level security;

create policy "own row only" on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row only" on wallets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row only" on positions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row only" on open_orders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row only" on trade_history for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row only" on academy_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row only" on automations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row only" on broker_credentials for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- automation_triggers has no user-facing writes at all — only the Cron
-- evaluator (via the service-role key, which bypasses RLS) ever writes it.
-- Owners can still read their own trigger state through the automation join.
alter table automation_triggers enable row level security;
create policy "read own trigger state" on automation_triggers for select
  using (exists (
    select 1 from automations a
    where a.id = automation_triggers.automation_id and a.user_id = auth.uid()
  ));

-- Phase C (automations real data model + trigger evaluator + MCP server) and
-- Phase F (email digest) additions — see
-- supabase/migrations/20260824120000_phase_c_and_f.sql for the same DDL as
-- actually applied to the live project.

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

alter table automation_triggers
  add column executions_count int not null default 0;

create table price_history (
  asset_id text not null,
  price numeric not null,
  ts timestamptz not null default now()
);
create index price_history_asset_ts_idx on price_history(asset_id, ts desc);

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

alter table profiles add column digest_opt_in boolean not null default true;

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
