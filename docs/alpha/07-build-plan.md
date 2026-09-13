# 07. Build plan: phases, gates, acceptance

Each phase is one plan file under `docs/alpha/plans/` produced by `/plan-eng-review` (and `/plan-design-review` where there is UI), then built, then `/review` and `/qa`, then committed. No phase starts before the previous phase's acceptance checks pass. The master prompt in `PROMPT-build-alpha.md` drives this loop without stopping between phases.

Ordering principle: the runner and its safety gates before any venue; the first external venue (Manifold) before football, because Manifold proves the full loop with a real API in a day; football is the largest and gets the most infra beneath it first.

## Phase 0. Ground truth and infra (half a day)

Build:
- Confirm Vercel plan; if Hobby, do not rely on `vercel.ts` cron. Apply the `04-schema.md` migration including `pg_cron`/`pg_net` and the five `cron.schedule` entries pointing at the production URL with `CRON_SECRET`. Confirm each job ticks (write to `alpha_events` kind `info` on first tick).
- Raise `price_history` retention to 30 days with downsampling after 48 h in `evaluate-triggers`.
- Add Vitest (`npm i -D vitest`), a `test:unit` script, and a first test for `orderExecution.ts` math so the money math has coverage before it is reused.
- Configure Supabase custom SMTP (infra, note it as a human task if credentials are absent).

Accept: `select * from cron.job` shows 5 jobs; `alpha_events` has a tick from each; `npm run test:unit` green; `npm run build` green.

## Phase 1. Alpha core: service, runner, risk gate, decisions, `/alpha` shell (2 days)

Build:
- `src/lib/alpha/core/*` interfaces from `03-architecture.md` §2.
- `src/lib/alpha/service.ts` (all business functions), `src/lib/alpha/risk.ts`, `src/lib/alpha/runner.ts`, `src/lib/alpha/settle.ts`, `src/lib/alpha/evaluate.ts` (metrics + budget rule), `src/lib/alpha/strategies/index.ts` registry.
- Routes: `/api/cron/alpha-run`, `/api/cron/alpha-settle`, `/api/cron/alpha-evaluate`, `/api/alpha/*` (session-scoped CRUD for the UI).
- Venue adapter 1: `zoqoTerminal.ts` wrapping `terminalExecution.ts`; server-side SL/TP check in `alpha-settle` for terminal positions opened by Alpha (tag them via `alpha_orders`).
- Strategy 1: `terminal-ma-cross` (port of the existing `ma-cross` condition as a strategy with `schedule.interval`), Strategy 2: `terminal-hourly-momentum` (the user's "trade every hour" case: every 60 min, long/short by 4 h return sign with ATR stop).
- `/alpha` page: kill switch, venues list, strategies list with enable/run now/params, decisions feed, events. Compose `HeaderChrome`. Playwright smoke test for the page and for "Run now" producing an `alpha_runs` row.
- Automations bridge: `schedule` condition and `run-strategy` action in `automationRules.ts`, `CreateAutomationModal`, evaluator.

Accept: with `NEXT_PUBLIC_BACKEND_ENABLED=1`, creating `terminal-hourly-momentum` with budget $1,000 and pressing Run now produces a decision, an order via `terminalExecution.ts`, a wallet delta, and a visible row on `/alpha` and `/profile` journal; the risk gate rejects an intent above `max_stake` and logs it; kill switch stops the next tick; Vitest covers Kelly sizing, budget rule, and metric math.

## Phase 2. Manifold adapter and prediction-market strategies (1 day)

Build:
- `manifold.ts` adapter (API key from `broker_credentials` via Vault or env), market search, quote, bet, settle.
- `marketFeatures.ts` (mid, spread, volume, time to close, momentum).
- Strategies: `manifold-mean-reversion` (fade > x% moves in thin markets with time to close), `manifold-longshot-fade` (sell overpriced < 5% or > 95% outcomes; classic favourite-longshot bias), `manifold-control` (random small bets, the control).
- MCP v2 scaffolding: scopes migration, `requireScope`, tools `list_venues`, `search_markets`, `get_quote_v2`, `list_strategies`, `create_strategy`, `run_strategy_now`, `list_decisions`, `get_leaderboard`, `kill_switch`.

Accept: a scheduled `manifold-mean-reversion` run places a real mana bet visible on manifold.markets under the user's account; settlement writes pnl; leaderboard shows three strategies with n; an MCP client (Claude Code with the key) can list venues, create and run a strategy, and flip the kill switch.

## Phase 3. Football data layer and paper sportsbook (3 days)

Build:
- Ingest job: fixtures, odds snapshots (odds-api.io: Bet9ja + SportyBet), results, lineups, injuries; token buckets in `alpha_rate_budget`.
- `fixtureFeatures.ts`, `ratings.ts` (ELO + Dixon-Coles in TS, fitted from the results table; backfill last 4 seasons from Football-Data.co.uk CSVs checked into `src/lib/alpha/__fixtures__/` for the top 5 leagues, which are free and include closing odds).
- `zoqoSportsbook.ts` adapter with NGN ledger, 1X2, DC, O/U 2.5, BTTS; settlement rules; slip builder.
- Strategies from `06-football-model.md` §5, including the market-only control.
- MCP: `list_fixtures`, `get_fixture`, `get_fixture_features`, `predict_fixture`, `get_odds_history`, `build_slip`, `backtest_strategy`.
- `/alpha` fixtures tab: model vs market probabilities per outcome per book, edge highlighting, slip builder, CLV column after kickoff.
- Backtest: walk-forward over the checked-in seasons; report RPS vs market, CLV, ROI CI. Vitest on the frozen 300-fixture sample.

Accept: 7 days of live snapshots accumulate without exceeding quotas; blend model RPS is within 0.005 of market RPS on the backtest (it will not beat it; that is expected); at least one paper bet per matchday is placed and settled correctly; slip text can be keyed into SportyBet by hand; CLV is computed for every settled bet.

## Phase 4. Kalshi demo, Bybit demo, Deriv virtual, Polymarket sim (2 days)

Build: four adapters behind the same interface, one simple strategy each (`kalshi-cross-venue-divergence` using `alpha_market_links` vs Manifold/Polymarket, `bybit-hourly-momentum` reusing the terminal strategy logic, `deriv-synthetic-meanrev` on a volatility index, `polymarket-sim-longshot-fade`). Credentials manager on `/alpha` and `set_venue_credentials`.

Accept: each adapter passes a shared adapter conformance test (`src/lib/alpha/venues/__tests__/conformance.test.ts`: list, quote, place tiny stake, open orders, cancel where supported, settle path) against the demo endpoints; the leaderboard ranks strategies across five venues.

## Phase 5. Learning loop completion (1.5 days)

Build: nightly budget re-allocation with the CI rule; weekly walk-forward parameter search with proposals; auto-pause on negative upper CI; `/alpha` proposals inbox; MCP `list_proposals`, `apply_proposal`, `get_strategy_stats`, `get_health`; daily digest email gains an Alpha section (reuse `brevo.ts`).

Accept: after a seeded 30 days of synthetic decisions (fixture file), the evaluator produces the expected allocation and pauses the losing control; a proposal appears and applying it changes params with an `applied` event.

## Phase 6. Python worker (optional, 2 days, only after Phase 3 has 4+ weeks of data)

`alpha-worker/` (Python, `penaltyblog`, `soccerdata`, CatBoost) run by GitHub Actions weekly; reads Supabase, writes `alpha_team_ratings` (xG, pi-ratings, ClubElo) and a `model_promotion` proposal with holdout RPS and CLV. Never places orders.

Accept: `ml` model appears in `predict_fixture`; promotion proposal only when CLV beats blend on holdout.

## Standing rules for every phase

- Plan → `/plan-eng-review` → (UI) `/plan-design-review` → build → `/review` → `/qa` → typecheck, lint, `test:unit`, `test:e2e`, production build → commit with a message that names the phase → update `docs/alpha/STATUS.md` (a running "done / next / blocked" file) → continue.
- Never edit `TerminalShell.tsx`, `store.tsx`, or `engine.ts`'s tick logic for Alpha needs. Extract pure math into new modules if needed.
- No new font families, no raw hex, CTAs pill, everything else per `design.md` and the `/design-system` skill.
- Any external call goes through the rate budget. Any money movement goes through the risk gate. Any secret goes through Vault or env, never a table column.
- When a free API is unreachable in the build environment, implement the adapter against its documented schema, mark the conformance test `skip` with the reason, and record it in STATUS.md as blocked-on-network, then continue.
- Human-only tasks (Supabase SMTP, Vercel plan, obtaining API keys for odds-api.io, API-Football, Manifold, Kalshi demo, Bybit demo, Deriv) are listed in STATUS.md under "needs Aise" with exact URLs. The build never waits on them; it works with whatever keys exist and skips the rest.
