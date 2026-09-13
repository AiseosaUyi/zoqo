# 05. MCP v2: control every aspect of ZOQO from code

Extends the existing server at `src/app/api/mcp/route.ts` (`mcp-handler`, per-user `zoqo_` keys). The 12 existing tools stay as they are. New tools are implemented in `src/lib/mcp/alphaTools.ts` and registered in the same `createMcpHandler` block. Every tool calls `src/lib/alpha/service.ts`, the same functions `/alpha` and the cron routes use.

## Scopes

`api_keys.scopes text[]` (new) with the legacy `scope` column kept in sync for old keys.

| Scope | Grants |
|---|---|
| `read` | existing terminal read tools |
| `trade` | existing terminal write tools |
| `alpha:read` | every `get_*`/`list_*` below |
| `alpha:run` | `run_strategy_now`, `place_intent`, `build_slip`, `cancel_order` |
| `alpha:manage` | create/update/pause strategies, venues, settings, apply proposals, kill switch |
| `alpha:credentials` | set/rotate venue credentials (never returns secrets) |

The `requireScope(ctx, "alpha:manage")` helper generalizes today's `requireTrade`. Every write tool checks it inside the handler, same pattern as now. Settings UI lets a key carry multiple scopes.

## Tools

### Venues and data
- `list_venues()` → venue ids, mode, enabled, currency, balance, caps, spent today, pnl today.
- `set_venue({venue, enabled?, max_stake?, daily_cap?, daily_loss_stop?})` [manage].
- `search_markets({venue, query?, category?, limit?})` → MarketRef[] with title, close time, current quote.
- `get_quote_v2({venue, marketId, outcomeId?})` → Quote (bid/ask/last or odds per book with implied prob).
- `get_balances()` → all venues plus terminal wallet.
- `set_venue_credentials({venue, fields})` [credentials] → stores in Vault, returns `{ok, keyPrefix}` only.

### Football
- `list_fixtures({league?, from?, to?, status?})`.
- `get_fixture({fixtureId})` → fixture, lineups, injuries, referee, all book odds, closing line if past kickoff.
- `get_fixture_features({fixtureId})` → the full feature vector (`06-football-model.md`).
- `predict_fixture({fixtureId, model?})` → `{home, draw, away, over25, btts}` probabilities from the named model (default: blended), plus market consensus, plus edge per outcome per book.
- `get_odds_history({fixtureId, book?, market?})` → snapshots.
- `build_slip({selections:[{fixtureId, market, outcome, book}], stakeTotal?, strategyId?})` [run] → slip with odds at now, implied probs, model probs, Kelly stakes, combined odds for a parlay, and a plain-text version a human can key into the bookmaker app. Also records an `alpha_decisions` row with `status='accepted'` on the `zoqo-sportsbook` venue if `place=true`.

### Strategies
- `list_strategy_templates()` → registry entries: key, description, venues, default params, param space, schedule kinds.
- `list_strategies()` → user instances with enabled, venue, budget, schedule, next/last run, paused reason, 7 d and all-time stats.
- `create_strategy({strategy_key, name, venue, params?, schedule, budget, max_stake, daily_cap, daily_loss_stop, kelly_fraction?, min_edge?, max_odds?})` [manage].
- `update_strategy({id, patch})` [manage].
- `pause_strategy({id, reason?})` / `resume_strategy({id})` [manage].
- `run_strategy_now({id})` [run] → sets `next_run_at=now()` and returns the run id once the runner picks it up (polls up to 60 s) or `{queued:true}`.
- `backtest_strategy({strategy_key, venue, params?, from, to})` [run] → walk-forward result on logged features and outcomes (football: odds snapshots and results; markets: quote history). Returns the same metrics as the nightly evaluator.
- `get_runs({strategyId?, limit?})`, `get_run({runId})` → log lines, intents, accepted/rejected.

### Orders and decisions
- `list_decisions({strategyId?, venue?, status?, since?, limit?})`.
- `list_orders({venue?, status?, since?, limit?})`.
- `place_intent({venue, marketId, outcomeId?, side, kind, limitPrice?, stake?, rationale})` [run] → goes through the risk gate exactly like a strategy intent; agent-driven orders are not exempt. Returns the decision (accepted or rejected with reason) and the order if placed.
- `cancel_order({orderId})` [run].
- `settle_now({venue?})` [run] → forces a settlement pass.

### Learning and control
- `get_leaderboard({window?: '7d'|'30d'|'all'})` → strategies ranked by ROI lower CI bound, with n, hit rate, Brier, RPS, CLV, drawdown, Sharpe, budget.
- `get_strategy_stats({id, from?, to?})` → daily rows.
- `list_proposals()` → unapplied `alpha_events` of kind `proposal` (param search results, model promotions).
- `apply_proposal({eventId})` [manage].
- `get_settings()` / `set_settings({leagues?, base_currency?})` [manage].
- `kill_switch({on: boolean, reason?})` [manage] → halts every runner immediately; cancels open demo orders where the venue supports it.
- `get_events({since?, kinds?})`, `ack_event({id})`.
- `get_health()` → scheduler last tick per job, rate budgets remaining per provider, adapter connectivity checks, stale-data warnings.

### Existing automations bridge
- `create_automation_trigger` gains condition `{type:'schedule', everyMin | cron}` and action `{type:'run-strategy', strategyId}` so old and new can be driven from either surface.

## Resources (MCP resources, read-only)
- `zoqo://alpha/strategies/{id}` JSON.
- `zoqo://alpha/fixtures/{id}` JSON.
- `zoqo://alpha/leaderboard` JSON.
- `zoqo://docs/alpha/*` serving the files in `docs/alpha/` so an agent can read the spec it is operating under.

## Prompts (MCP prompts)
- `daily-review` → assembles leaderboard, events, proposals, open orders into a review brief.
- `pre-kickoff-scan` → fixtures in the next N hours with edges above threshold.

## Triggering from ZOQO itself
`/alpha` "Run now" and `/automations` schedule triggers both call `service.runStrategyNow`. The scheduler self-triggers. MCP triggers. One runner, one gate, three doors.

## Security notes
- Keys with `alpha:credentials` should be single-purpose. The UI warns on issue.
- All MCP writes are logged to `alpha_events` kind `info` with `via:'mcp', keyPrefix`.
- `mode='live'` is rejected at the schema level in this program. Any tool argument attempting it returns an error, not a silent downgrade.
