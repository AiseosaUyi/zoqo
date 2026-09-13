# 04. Schema additions (one migration, appended to `supabase/schema.sql`)

Conventions match the existing schema: text ids where the client generates them, `user_id uuid references auth.users`, RLS "own row only" on user tables, evaluator-written tables readable by owner and written only via service role. Money columns `numeric(14,2)`, prices and odds `numeric(20,8)`.

```sql
-- Extensions for the scheduler (Supabase free tier supports both).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Per-user global switches and defaults.
create table alpha_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  kill_switch    boolean not null default false,
  leagues        text[] not null default '{}',          -- API-Football league ids
  base_currency  text not null default 'NGN',
  updated_at     timestamptz not null default now()
);

-- Per-user venue enablement and caps. One row per (user, venue).
create table alpha_venues (
  user_id      uuid not null references auth.users(id) on delete cascade,
  venue        text not null,                           -- VenueId
  mode         text not null default 'paper' check (mode in ('paper','demo')),  -- 'live' deliberately not allowed
  enabled      boolean not null default false,
  currency     text not null,
  max_stake    numeric(14,2) not null,
  daily_cap    numeric(14,2) not null,
  daily_loss_stop numeric(14,2) not null,
  spent_today  numeric(14,2) not null default 0,
  pnl_today    numeric(14,2) not null default 0,
  day_reset_at timestamptz not null default now(),
  primary key (user_id, venue)
);

-- Paper ledgers for internal venues (sportsbook NGN, predict USD). Terminal keeps `wallets.cash`.
create table alpha_ledger (
  user_id   uuid not null references auth.users(id) on delete cascade,
  venue     text not null,
  currency  text not null,
  balance   numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),        -- optimistic-concurrency token, same pattern as wallets
  primary key (user_id, venue)
);

-- A user's instance of a registered strategy.
create table alpha_strategies (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  strategy_key  text not null,                          -- matches src/lib/alpha/strategies registry
  name          text not null,
  venue         text not null,
  enabled       boolean not null default false,
  params        jsonb not null default '{}',
  schedule      jsonb not null,                         -- {kind:'interval',everyMin:60} | {kind:'cron',expr} | {kind:'event',on}
  budget        numeric(14,2) not null,                 -- current allocation (evaluator may adjust)
  budget_floor  numeric(14,2) not null default 0,
  max_stake     numeric(14,2) not null,
  daily_cap     numeric(14,2) not null,
  daily_loss_stop numeric(14,2) not null,
  kelly_fraction numeric(5,4) not null default 0.25,
  min_edge      numeric(6,4) not null default 0.02,
  max_odds      numeric(8,2),
  cooldown_min  int not null default 60,
  next_run_at   timestamptz not null default now(),
  last_run_at   timestamptz,
  paused_reason text,
  created_at    timestamptz not null default now()
);
create index alpha_strategies_due_idx on alpha_strategies(next_run_at) where enabled;

-- One row per runner invocation per strategy.
create table alpha_runs (
  id           uuid primary key default gen_random_uuid(),
  strategy_id  text not null references alpha_strategies(id) on delete cascade,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  trigger      text not null check (trigger in ('schedule','manual','mcp','event')),
  intents      int not null default 0,
  accepted     int not null default 0,
  rejected     int not null default 0,
  error        text,
  log          jsonb not null default '[]'
);

-- Every intent, accepted or not. This is the dataset the learning loop runs on.
create table alpha_decisions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  strategy_id   text not null references alpha_strategies(id) on delete cascade,
  run_id        uuid references alpha_runs(id) on delete set null,
  venue         text not null,
  market_id     text not null,
  outcome_id    text,
  side          text not null,
  status        text not null check (status in ('accepted','rejected')),
  reject_reason text,
  edge          numeric(8,5),
  model_prob    numeric(8,5),
  market_prob   numeric(8,5),
  price_or_odds numeric(20,8),
  stake         numeric(14,2),
  currency      text,
  rationale     text not null,
  features      jsonb,
  decided_at    timestamptz not null default now()
);
create index alpha_decisions_strategy_idx on alpha_decisions(strategy_id, decided_at desc);

-- Orders actually placed on a venue (paper or demo). Settled in place.
create table alpha_orders (
  id              uuid primary key default gen_random_uuid(),
  decision_id     uuid not null references alpha_decisions(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  venue           text not null,
  venue_order_id  text not null,
  market_id       text not null,
  outcome_id      text,
  side            text not null,
  kind            text not null check (kind in ('market','limit','parlay')),
  stake           numeric(14,2) not null,
  currency        text not null,
  price_or_odds   numeric(20,8) not null,
  book            text,                                 -- sportsbook only: 'bet9ja' | 'sportybet'
  status          text not null check (status in ('open','filled','partial','rejected','cancelled','settled','void')),
  outcome         text check (outcome in ('won','lost','void','closed')),
  pnl             numeric(14,2),
  closing_price_or_odds numeric(20,8),                  -- for CLV
  placed_at       timestamptz not null default now(),
  settled_at      timestamptz,
  legs            jsonb                                 -- parlay legs
);
create index alpha_orders_open_idx on alpha_orders(venue, status) where status in ('open','filled','partial');

-- Nightly per-strategy metrics (evaluator-written).
create table alpha_strategy_stats (
  strategy_id   text not null references alpha_strategies(id) on delete cascade,
  day           date not null,
  n             int not null,
  roi           numeric(8,5),
  roi_ci_low    numeric(8,5),
  roi_ci_high   numeric(8,5),
  hit_rate      numeric(8,5),
  brier         numeric(8,5),
  rps           numeric(8,5),
  clv           numeric(8,5),
  max_drawdown  numeric(8,5),
  sharpe        numeric(8,5),
  pnl_today     numeric(14,2) not null default 0,
  pnl_total     numeric(14,2) not null default 0,
  budget_after  numeric(14,2),
  primary key (strategy_id, day)
);

-- Human-visible events: pauses, proposals, kill switch, errors.
create table alpha_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  strategy_id text references alpha_strategies(id) on delete cascade,
  kind        text not null check (kind in ('paused','resumed','proposal','applied','error','kill','info')),
  payload     jsonb not null default '{}',
  acknowledged boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Football data (shared across users; written by ingest via service role; readable by all authenticated).
create table alpha_fixtures (
  id            text primary key,                       -- API-Football fixture id
  league_id     text not null,
  season        int not null,
  kickoff_at    timestamptz not null,
  home_team_id  text not null, home_team text not null,
  away_team_id  text not null, away_team text not null,
  status        text not null,                          -- NS, 1H, HT, 2H, FT, AET, PEN, PST, CANC
  home_goals    int, away_goals int,
  lineups       jsonb, injuries jsonb, referee text, venue text,
  updated_at    timestamptz not null default now()
);
create index alpha_fixtures_kickoff_idx on alpha_fixtures(kickoff_at);

create table alpha_odds_snapshots (
  fixture_id  text not null references alpha_fixtures(id) on delete cascade,
  book        text not null,
  market      text not null,                            -- '1x2' | 'ou25' | 'btts' | 'dc'
  outcome     text not null,                            -- 'home' | 'draw' | 'away' | 'over' | 'under' | 'yes' | 'no' | 'hd' | 'da' | 'ha'
  decimal_odds numeric(20,8) not null,
  ts          timestamptz not null default now(),
  primary key (fixture_id, book, market, outcome, ts)
);

create table alpha_team_ratings (
  team_id     text not null,
  as_of       date not null,
  elo         numeric(10,4),
  attack      numeric(10,6), defence numeric(10,6),     -- Dixon-Coles strengths
  xg_for_l5   numeric(8,4), xg_against_l5 numeric(8,4),
  form_l5     numeric(6,4), form_l10 numeric(6,4),
  primary key (team_id, as_of)
);

-- Cross-venue question matching for prediction markets.
create table alpha_market_links (
  id          uuid primary key default gen_random_uuid(),
  canonical   text not null,                            -- normalized question
  venue       text not null,
  market_id   text not null,
  confirmed   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (venue, market_id)
);

-- External API quota tracking (token buckets) so strategies cannot exhaust free tiers.
create table alpha_rate_budget (
  provider    text primary key,                         -- 'odds-api.io' | 'api-football' | 'manifold' | ...
  window_start timestamptz not null,
  used        int not null default 0,
  limit_per_window int not null,
  window_seconds int not null
);

-- RLS
alter table alpha_settings enable row level security;
alter table alpha_venues enable row level security;
alter table alpha_ledger enable row level security;
alter table alpha_strategies enable row level security;
alter table alpha_decisions enable row level security;
alter table alpha_orders enable row level security;
alter table alpha_events enable row level security;
create policy "own row only" on alpha_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row only" on alpha_venues for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row only" on alpha_ledger for select using (auth.uid() = user_id);
create policy "own row only" on alpha_strategies for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row only" on alpha_decisions for select using (auth.uid() = user_id);
create policy "own row only" on alpha_orders for select using (auth.uid() = user_id);
create policy "own row only" on alpha_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table alpha_runs enable row level security;
create policy "read own runs" on alpha_runs for select using (exists (select 1 from alpha_strategies s where s.id = alpha_runs.strategy_id and s.user_id = auth.uid()));
alter table alpha_strategy_stats enable row level security;
create policy "read own stats" on alpha_strategy_stats for select using (exists (select 1 from alpha_strategies s where s.id = alpha_strategy_stats.strategy_id and s.user_id = auth.uid()));

alter table alpha_fixtures enable row level security;
alter table alpha_odds_snapshots enable row level security;
alter table alpha_team_ratings enable row level security;
alter table alpha_market_links enable row level security;
create policy "authenticated read" on alpha_fixtures for select using (auth.role() = 'authenticated');
create policy "authenticated read" on alpha_odds_snapshots for select using (auth.role() = 'authenticated');
create policy "authenticated read" on alpha_team_ratings for select using (auth.role() = 'authenticated');
create policy "authenticated read" on alpha_market_links for select using (auth.role() = 'authenticated');
-- alpha_rate_budget: service role only, no policy needed beyond enabling RLS.
alter table alpha_rate_budget enable row level security;

-- Existing tables: small extensions.
alter table api_keys drop constraint if exists api_keys_scope_check;
alter table api_keys add constraint api_keys_scope_check
  check (scope in ('read','trade','alpha:read','alpha:run','alpha:manage','alpha:credentials'));
alter table api_keys add column scopes text[];           -- multi-scope keys; `scope` kept for backward compat
alter table automations drop constraint if exists automations_condition_type_check;
alter table automations add constraint automations_condition_type_check
  check (condition_type is null or condition_type in ('price-cross','pct-change','ma-cross','schedule'));
-- price_history: keep 30 days, downsampled (see architecture §4). Retention change is in code, not DDL.
```

Regenerate `src/lib/supabase/database.types.ts` after applying (`supabase gen types typescript --linked > src/lib/supabase/database.types.ts`).
