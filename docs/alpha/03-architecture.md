# 03. Architecture: ZOQO Alpha (multi-venue automated trading and betting engine)

"Alpha" is the working name for the new layer. It is server-side, lives under `src/lib/alpha/` and `src/app/api/alpha/`, has its own page `/alpha`, its own tables (`04-schema.md`), and its own MCP tools (`05-mcp-spec.md`). It never imports from `TerminalShell.tsx` or `store.tsx`.

## 1. The one sentence

A **scheduler** wakes a **runner**; the runner loads enabled **strategies**, each strategy pulls **data** through **venue adapters** and **feature providers**, emits **intents**, the **risk gate** sizes and caps them, the **executor** places them on the venue (paper or demo), the **settler** resolves outcomes later, the **evaluator** scores every strategy nightly and re-allocates **budget**, and the **MCP** plus `/alpha` expose every one of those nouns to a human or an agent.

```
pg_cron ──HTTP──▶ /api/cron/alpha-run ─▶ Runner
                                          │  for each due strategy
                                          ▼
                                       Strategy.evaluate(ctx) ──▶ Intent[]
                                          │              ctx = { venue, features, quotes, budget, clock }
                                          ▼
                                       RiskGate (Kelly fraction, per-strategy budget, per-venue cap,
                                                 daily loss stop, global kill switch)
                                          ▼
                                       Executor ─▶ VenueAdapter.place() ─▶ alpha_orders + alpha_decisions
                                                                     (terminal → terminalExecution.ts, unchanged)

pg_cron ──HTTP──▶ /api/cron/alpha-settle ─▶ VenueAdapter.settle() ─▶ alpha_orders.outcome, ledger
pg_cron ──HTTP──▶ /api/cron/alpha-evaluate ─▶ per-strategy metrics ─▶ alpha_strategy_stats, budget update
pg_cron ──HTTP──▶ /api/cron/alpha-ingest ─▶ fixtures, odds snapshots, closing lines, quotes
```

## 2. Core interfaces (TypeScript, `src/lib/alpha/core/`)

```ts
// venue.ts
export type VenueId =
  | "zoqo-terminal" | "zoqo-predict" | "zoqo-sportsbook"
  | "manifold" | "kalshi-demo" | "bybit-demo" | "deriv-virtual" | "polymarket-sim";

export type VenueMode = "paper" | "demo" | "live"; // live is never enabled in this program

export interface MarketRef { venue: VenueId; marketId: string; outcomeId?: string; }

export interface Quote {
  market: MarketRef;
  ts: number;
  bid?: number; ask?: number; last?: number;      // price venues
  decimalOdds?: number; impliedProb?: number;     // odds venues (after margin removal, see features)
  book?: string;                                  // "bet9ja" | "sportybet" | ...
}

export interface Intent {
  strategyId: string;
  market: MarketRef;
  side: "buy" | "sell" | "long" | "short" | "back" | "lay" | "yes" | "no";
  kind: "market" | "limit";
  limitPrice?: number;
  edge: number;            // modelProb - marketProb (or expected return), signed
  modelProb?: number;
  marketProb?: number;
  suggestedStakePct?: number;  // fraction of strategy budget, pre risk gate
  rationale: string;       // human-readable; stored verbatim
  features?: Record<string, number | string>; // snapshot used to decide
  expiresAt?: number;
}

export interface PlacedOrder {
  venueOrderId: string; market: MarketRef; side: Intent["side"];
  stake: number; currency: "USD" | "NGN" | "MANA" | "USDT";
  priceOrOdds: number; placedAt: number; status: "open" | "filled" | "partial" | "rejected" | "cancelled";
}

export interface Settlement { venueOrderId: string; outcome: "won" | "lost" | "void" | "closed"; pnl: number; settledAt: number; closingPriceOrOdds?: number; }

export interface VenueAdapter {
  id: VenueId; mode: VenueMode; currency: PlacedOrder["currency"];
  listMarkets(q: { query?: string; category?: string; limit?: number }): Promise<MarketRef[]>;
  getQuote(m: MarketRef): Promise<Quote | null>;
  place(intent: Intent, stake: number, ctx: ExecCtx): Promise<PlacedOrder>;
  cancel?(venueOrderId: string): Promise<void>;
  openOrders(): Promise<PlacedOrder[]>;
  settle(open: PlacedOrder[]): Promise<Settlement[]>;
  balance(): Promise<{ cash: number; currency: PlacedOrder["currency"] }>;
}
```

```ts
// strategy.ts
export interface StrategyCtx {
  userId: string; now: number; venue: VenueAdapter;
  budget: { available: number; currency: string };
  features: FeatureProvider;   // getFixtureFeatures, getPriceFeatures, getMarketFeatures
  quotes: (m: MarketRef) => Promise<Quote | null>;
  params: Record<string, unknown>;  // strategy-specific, editable from UI/MCP
  log: (msg: string, data?: unknown) => void;
}

export interface Strategy {
  key: string;                 // "football-value-1x2", "manifold-mean-reversion", "terminal-ma-cross"
  venues: VenueId[];
  schedule: { kind: "interval"; everyMin: number } | { kind: "cron"; expr: string } | { kind: "event"; on: "fixture-T-minus-60" | "price-cross" };
  defaultParams: Record<string, unknown>;
  evaluate(ctx: StrategyCtx): Promise<Intent[]>;
}
```

Strategies are plain modules in `src/lib/alpha/strategies/*.ts`, registered in `src/lib/alpha/strategies/index.ts`. A user's *instance* of a strategy (params, budget, enabled, venue) is a row in `alpha_strategies`. The existing `automations` table keeps doing what it does; a new condition type `schedule` and a new action type `run-strategy` bridge the old UI to the new runner so the `/automations` page can trigger strategies without a second UI.

## 3. Venue adapters (`src/lib/alpha/venues/`)

| Adapter | Backing | Currency | place() | settle() |
|---|---|---|---|---|
| `zoqoTerminal.ts` | `terminalExecution.ts` (unchanged) | USD paper | `openTerminalPosition` | Reads `trade_history` for closes; SL/TP checked server-side by `alpha-settle` (new, because client-side checks do not run unattended) |
| `zoqoPredict.ts` | Existing `/trade` engine is client-side; adapter uses real BTC price + the same Bachelier pricing (`engine.ts` math extracted to a pure module) to price and settle server-side binaries | USD paper | Insert into `positions` kind `prediction` | Settle by BTC close vs strike at market end |
| `zoqoSportsbook.ts` | New. Markets = fixtures × markets (1X2, O/U 2.5, BTTS, Asian handicap later) priced from odds snapshots | **NGN paper** | Records `alpha_orders` with book, odds taken, stake; deducts from `alpha_ledger` NGN | Result from API-Football; closing odds from last snapshot before kickoff |
| `manifold.ts` | Manifold REST (`/v0/markets`, `/v0/market/{id}`, `POST /v0/bet`, `/v0/bets`) | MANA | Real API call | Real API (resolution) |
| `kalshiDemo.ts` | Kalshi demo trade-api v2, RSA-PSS signing | USD demo | Real API | Real API |
| `bybitDemo.ts` | Bybit v5 demo, HMAC | USDT demo | Real API (spot/perp market and limit) | Positions/fills from API |
| `derivVirtual.ts` | Deriv WebSocket API, virtual account token | USD virtual | `buy` contracts (rise/fall, multipliers) | Contract outcome via `proposal_open_contract` |
| `polymarketSim.ts` | Gamma + CLOB read; fills simulated against live book (port of `polymarket-paper-trader`'s level-by-level fill) | USD paper | Simulated fill with fees and slippage | Resolution from Gamma |

Credentials: per user, in `broker_credentials` (finally used). `secret_ref` points at a Supabase Vault secret; adapters read via a server-only `getVenueSecret(userId, venue)`. Env-var fallback for the single-user phase.

Rate limits are enforced per adapter with a token bucket persisted in `alpha_rate_budget` (odds-api.io 100/hr, API-Football 100/day, Manifold 500/min) so a buggy strategy cannot burn the day's quota in one run.

## 4. Feature providers (`src/lib/alpha/features/`)

- `priceFeatures.ts`: reuses `price_history` (raise retention to 30 days with a per-minute → per-5-minute downsample after 48 h) and `/api/btc/history` (generalize to ETH/SOL and Twelve Data `time_series` as TODOS already scoped). Returns returns, realized vol, MAs, RSI, ATR, session flags (`tradingSessions.ts` exists).
- `fixtureFeatures.ts` (football): per fixture returns the feature vector in `06-football-model.md`: implied probs per book with margin removed (multiplicative and Shin methods), consensus prob, line movement since open, home advantage, ELO (ClubElo when the Python worker exists; else a self-maintained ELO from results), time-decayed attack/defence strengths (Dixon-Coles fit), last-5 and last-10 form, rest days, lineup known flag, starters missing vs last match, injuries count and "key player" flag, referee (when available), competition stage.
- `marketFeatures.ts` (prediction markets): mid, spread, depth, 24 h volume, time to resolution, price momentum, cross-venue divergence (same question on Manifold vs Polymarket vs Kalshi, matched by a `alpha_market_links` table maintained by a matching job and confirmable from `/alpha`).

## 5. Risk gate (`src/lib/alpha/risk.ts`)

Applied to every intent, no exceptions, before any adapter is called:

1. Global kill switch (`alpha_settings.kill_switch`) and per-venue enable.
2. Strategy enabled and within its schedule window.
3. Stake = min(fractional Kelly(edge, odds, fraction=params.kellyFraction default 0.25) × strategy budget, `strategy.max_stake`, `venue.max_stake`, remaining `strategy.daily_cap`, remaining `venue.daily_cap`).
4. Daily loss stop per strategy and per venue (`alpha_strategy_stats.pnl_today`); tripping it pauses the strategy and writes an `alpha_events` row.
5. Exposure caps: max open positions per strategy, max exposure per market, no duplicate intent on the same market within `cooldownMin`.
6. Minimum edge threshold and maximum odds (long shots off by default).
7. Every rejection is logged to `alpha_decisions` with `status='rejected'` and the reason. Rejections are data.

This mirrors and supersets the existing `max_order_size`/`daily_cap` semantics. Terminal orders still additionally pass through `terminalExecution.ts`'s own checks.

## 6. Scheduler

Primary: Supabase `pg_cron` + `pg_net`. Migration enables both extensions and schedules:

```sql
select cron.schedule('alpha-run',      '* * * * *',    $$ select net.http_get(url:='https://<site>/api/cron/alpha-run',      headers:='{"Authorization":"Bearer <CRON_SECRET>"}') $$);
select cron.schedule('alpha-settle',   '*/5 * * * *',  ...);
select cron.schedule('alpha-ingest',   '*/15 * * * *', ...);
select cron.schedule('alpha-evaluate', '15 2 * * *',   ...);
select cron.schedule('evaluate-triggers', '* * * * *', ...);  -- takes over from Vercel Hobby's daily cadence
```

`alpha-run` is idempotent and cheap when nothing is due: it selects strategies whose `next_run_at <= now()`, claims them with an `UPDATE ... WHERE next_run_at <= now() RETURNING` (no double runs across overlapping invocations), runs at most N per invocation, writes `alpha_runs`, and sets `next_run_at`. "Every hour" is `schedule = {kind:'interval', everyMin:60}`. Manual "Run now" from `/alpha` or MCP `run_strategy_now` sets `next_run_at = now()` and the same route picks it up within a minute, so there is exactly one runner.

Fallback: `.github/workflows/alpha-cron.yml` with `schedule: "*/5 * * * *"` doing the same curls. Keep `vercel.ts` entries.

## 7. Learning loop (the part the user called "learn how to trade")

Be precise about what learns and how, because "AI learns to trade" is where projects lie to themselves.

Level 1, always on: **Decision logging.** Every intent (accepted or rejected) stores features, model prob, market prob, odds/price taken, stake, rationale, and later the outcome and closing line. Nothing is ever backfilled from hindsight.

Level 2, nightly (`alpha-evaluate`): **Scoring per strategy per venue**: ROI, hit rate, Brier score and RPS (probabilistic quality), CLV (average of `closingImplied / takenImplied - 1`), max drawdown, Sharpe-like ratio on daily P&L, sample size, and a 95% bootstrap CI on ROI. Written to `alpha_strategy_stats` and shown on `/alpha`.

Level 3, nightly: **Capital allocation.** Budget across strategies is re-weighted by a conservative rule: start equal; after `min_samples` (default 50 bets or 100 trades) allocate proportional to `max(0, lower CI bound of ROI)` with a floor so no strategy goes to zero while it is still collecting samples; strategies with negative upper CI bound are auto-paused. This is a bandit with a sample-size guard, not a neural net, and it is honest.

Level 4, weekly: **Parameter search.** For strategies that declare a `paramSpace`, the evaluator runs a grid or random search on the last N weeks of logged features and outcomes (walk-forward, never in-sample), proposes a param set, and writes an `alpha_events` row of kind `proposal`. Applying it requires a human click on `/alpha` or the MCP `apply_proposal` tool. Nothing self-modifies silently.

Level 5, phase 3 (Python worker): **Model retraining.** Dixon-Coles refit weekly, CatBoost on pi-ratings + xG as challenger, evaluated by RPS and CLV against the market on a holdout, promoted only if it beats the market-blend baseline on CLV. Reported the same way.

The `/alpha` page shows a **strategy leaderboard** with these numbers so the user can see which venue and which strategy actually makes (paper) money and which is noise.

## 8. Football paper sportsbook (`zoqoSportsbook.ts`) specifics

- Ledger in NGN. Starting balance configurable (default ₦100,000 paper). Faucet like the existing deposit cooldown.
- Markets ingested from odds-api.io for the leagues in `alpha_settings.leagues` (default: EPL, La Liga, Serie A, Bundesliga, Ligue 1, UCL, NPFL if available). Snapshots every 15 min in the 48 h before kickoff, every 5 min in the last 2 h. Last snapshot before kickoff = closing line.
- Bet types phase 1: 1X2, double chance, over/under 2.5, BTTS. Accumulators phase 2 (as a `parlay` order with combined odds and independent-leg settlement).
- Settlement from API-Football fixture status `FT` (and `AET`/`PEN` rules per market). Void on postponement.
- Slip export: any accepted intent can be rendered as a slip (book, selections, odds at decision, suggested stake) on `/alpha` and via MCP `build_slip`, for a human to place by hand. That is the only real-money bridge and it is out of scope to automate.

## 9. `/alpha` page (UI, uses existing design system)

Sections: kill switch and venue toggles; strategy list with enable, budget, schedule, "Run now", params editor, last run and next run; live feed of decisions and rejections; portfolio by venue and by strategy; leaderboard with the metrics above; proposals inbox; fixtures view with model vs market probabilities and the slip builder; credentials manager (venue keys, scoped). Header composes `HeaderChrome.tsx` pieces. Mobile stacks. Charts use `lightweight-charts` only where a time series earns it.

## 10. Control surfaces (three, one backend)

1. `/alpha` UI (session cookie auth).
2. MCP (`05-mcp-spec.md`) with new scopes `alpha:read`, `alpha:run`, `alpha:manage`, `alpha:credentials`.
3. Scheduler (service role via `CRON_SECRET`).

All three call the same functions in `src/lib/alpha/service.ts`. No logic in route handlers.

## 11. Non-goals for this program

Real-money placement of any kind. Scraping a Nigerian bookmaker to place bets. Multi-tenant venue credentials sharing. A mobile app. Anything that requires the terminal chart.
