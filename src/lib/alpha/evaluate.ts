import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { bootstrapRoiCI, hitRate, maxDrawdown, sharpeLike, clv as clvOf, rps as rpsOf, brier as brierOf, type BootstrapRoiCI } from "./football/metrics";
import type { OneXTwoOutcome } from "./football/types";
import { parseMarketId as parseSportsbookMarketId } from "./venues/zoqoSportsbook";
import { reallocate, DEFAULT_MIN_SAMPLES, type StrategySnapshot, type ReallocationDecision } from "./budgetRule";
import { computeCopyGap, type CopyDecisionOutcome } from "./copy/gap";

const COPY_STRATEGY_KEYS = new Set(["polymarket-copy-sources", "manifold-copy-sources", "copy-random-control"]);

/** Nightly evaluator (docs/alpha/03-architecture.md §7 Levels 2 and 3) —
 *  `/api/cron/alpha-evaluate` calls `evaluateStrategies` once a day. This
 *  REPLACES Phase 1's stub, which wrote `n`/`pnl_today`/`pnl_total` only and
 *  left every other `alpha_strategy_stats` column null on purpose. This file
 *  fills those in for real from `football/metrics.ts` (domain-agnostic
 *  despite the folder name — see that file's own header) and reallocates
 *  budget per-user via `budgetRule.ts`'s `reallocate()`, which this file
 *  does not modify (it is Phase 5's already-built, already-tested contract).
 *
 *  WHAT'S STILL HONESTLY NULL, PER STRATEGY:
 *  - `clv`: only meaningful for venues whose `price_or_odds` is odds/an
 *    implied probability at all. `zoqo-terminal`/`bybit-demo`/`deriv-virtual`
 *    (and the unimplemented `zoqo-predict`) trade a raw spot/CFD PRICE, not
 *    odds against a "closing line" — there is no honest implied-probability
 *    reading of a BTC price, so CLV stays null for those venues' strategies,
 *    not a fabricated 0. See `impliedProbFor` below for the per-venue
 *    convention this required getting right (decimal odds vs. an
 *    already-implied probability differ by venue — see that function's own
 *    comment for which is which and why).
 *  - `rps`/`brier`: only computed for `zoqo-sportsbook` strategies (the one
 *    venue in this program with a recoverable 1X2/binary outcome AND a
 *    logged `model_prob`). `brier` needs just one predicted probability +
 *    one realized boolean per settled order, so every settled sportsbook
 *    order with a `model_prob` on its decision contributes. `rps` needs the
 *    FULL predicted 3-outcome (home/draw/away) distribution, but
 *    `alpha_decisions.model_prob` only ever logs the probability of the ONE
 *    outcome a strategy actually backed (see `footballValue1x2.ts`) — so an
 *    RPS point is only recoverable for a fixture where the SAME strategy run
 *    logged all three outcomes' `model_prob` in the same `run_id` (i.e. all
 *    three cleared its edge threshold in the same pass). Fixtures where
 *    fewer than three outcomes fired produce no RPS point at all — this
 *    UNDERCOUNTS how often a real RPS could exist, on purpose, rather than
 *    guessing the missing legs of the distribution. */

type Client = SupabaseClient<Database>;

function todayDate(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD, matches alpha_strategy_stats.day
}

function dayStartIso(now: number): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// CLV — per-venue price/odds convention (the part the build prompt calls out
// as easy to get silently wrong).
// ---------------------------------------------------------------------------

/** Venues whose `alpha_orders.price_or_odds`/`closing_price_or_odds` are
 *  stored as DECIMAL ODDS (>1, higher = a longer/better price for the
 *  bettor) — see `venues/zoqoSportsbook.ts`'s `place()`/`settle()`, which
 *  writes `best.decimal_odds` verbatim. These need `1/decimalOdds` to become
 *  an implied probability before `clv()` (which takes implied probabilities,
 *  not raw odds — see `football/metrics.ts`'s own header). */
const DECIMAL_ODDS_VENUES = new Set(["zoqo-sportsbook"]);

/** Venues whose `price_or_odds` IS ALREADY an implied probability in [0,1] —
 *  no conversion needed. Verified per-adapter:
 *  - `manifold.ts`: `priceOrOdds` is the CFMM's `probability` field directly
 *    (a binary market's probability IS its price on Manifold — see that
 *    file's module header).
 *  - `kalshi-demo`: `priceOrOdds` is `askCents/100` — Kalshi's contracts pay
 *    exactly $1 on the winning side, so a contract's price in dollars IS the
 *    market's implied probability of that side.
 *  - `polymarket-sim`: `priceOrOdds` is the VWAP CLOB fill price from
 *    `walkOrderBook`, in the same $0..$1 share-price-as-probability
 *    convention as every CLOB-based prediction market. */
const IMPLIED_PROB_VENUES = new Set(["manifold", "kalshi-demo", "polymarket-sim"]);

// Deliberately NOT in either set above (documented, not an oversight):
// - "zoqo-terminal" (`zoqoTerminal.ts`) and "bybit-demo" (`bybitDemo.ts`)
//   store a raw asset PRICE (USD), not odds or a probability of anything.
// - "deriv-virtual" (`derivVirtual.ts`) stores a fixed-duration contract's
//   dollar buy price, which only maps to an implied probability if you also
//   know the contract's payout — not persisted on `PlacedOrder`/`alpha_orders`
//   — so it can't be honestly converted either.
// - "zoqo-predict" has no adapter at all yet (`venues/index.ts`).
// `impliedProbFor` returns null for all of these, and CLV is left null for
// their strategies rather than computing a number that isn't really a CLV.

/** Converts a venue's raw `price_or_odds`/`closing_price_or_odds` into an
 *  implied probability, or `null` when this venue's price isn't a
 *  probability/odds concept at all (see the two Sets above). Exported for
 *  unit testing without a database (see `__tests__/evaluate.test.ts`). */
export function impliedProbFor(venue: string, priceOrOdds: number): number | null {
  if (!(priceOrOdds > 0)) return null;
  if (DECIMAL_ODDS_VENUES.has(venue)) return 1 / priceOrOdds;
  if (IMPLIED_PROB_VENUES.has(venue)) return priceOrOdds;
  return null;
}

/** CLV for one settled order, or `null` when it's not computable — either
 *  because the venue's price isn't odds/a probability (see `impliedProbFor`)
 *  or because `closing_price_or_odds` is missing (void orders, or a venue
 *  whose `settle()` genuinely has no closing-line source, e.g. a fallback in
 *  `zoqoSportsbook.ts`'s `closingOddsFor`). Per this phase's own rule: an
 *  order with no computable CLV is skipped from the average, never treated
 *  as a fabricated 0. Exported for unit testing. */
export function clvForOrder(venue: string, priceOrOdds: number, closingPriceOrOdds: number | null | undefined): number | null {
  if (closingPriceOrOdds == null) return null;
  const takenImplied = impliedProbFor(venue, priceOrOdds);
  const closingImplied = impliedProbFor(venue, closingPriceOrOdds);
  if (takenImplied == null || closingImplied == null) return null;
  return clvOf(takenImplied, closingImplied);
}

function mean(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// ---------------------------------------------------------------------------
// Per-strategy metric computation (Level 2)
// ---------------------------------------------------------------------------

interface SettledOrderRow {
  id: string;
  decision_id: string;
  pnl: number | null;
  stake: number;
  price_or_odds: number;
  closing_price_or_odds: number | null;
  settled_at: string | null;
  outcome: string | null;
}

interface DecisionRow {
  id: string;
  run_id: string | null;
  market_id: string;
  model_prob: number | null;
}

interface ComputedStats {
  n: number;
  pnlToday: number;
  pnlTotal: number;
  nSamples: number; // all-time settled count, feeds budgetRule.ts's StrategySnapshot
  roi: BootstrapRoiCI | null;
  hitRate: number | null;
  maxDrawdown: number | null;
  sharpe: number | null;
  clv: number | null;
  brier: number | null;
  rps: number | null;
}

/** Recovers `home`/`draw`/`away` from a completed fixture's final score —
 *  duplicated in spirit from `zoqoSportsbook.ts`'s `resolveOutcome` (which
 *  answers "did THIS outcome win", not "which outcome won"), kept local
 *  since this is the only caller that needs the categorical form for RPS. */
function outcomeFromScore(homeGoals: number, awayGoals: number): OneXTwoOutcome {
  if (homeGoals > awayGoals) return "home";
  if (awayGoals > homeGoals) return "away";
  return "draw";
}

const FIXTURE_COMPLETED_STATUSES = new Set(["FT", "AET", "PEN"]);

async function computeStrategyStats(supabase: Client, strategy: { id: string; venue: string }, day: string, dayStart: string): Promise<ComputedStats> {
  // --- n / pnl_today / pnl_total: unchanged Phase 1 semantics (decisions
  // ACCEPTED today, orders of theirs SETTLED today) — this phase doesn't
  // touch this part, it was already correct; only the metrics below are new.
  const { data: decisionsToday } = await supabase
    .from("alpha_decisions")
    .select("id")
    .eq("strategy_id", strategy.id)
    .eq("status", "accepted")
    .gte("decided_at", dayStart);
  const decisionIdsToday = (decisionsToday ?? []).map((d) => d.id);

  let pnlToday = 0;
  let n = 0;
  if (decisionIdsToday.length > 0) {
    const { data: settledToday } = await supabase
      .from("alpha_orders")
      .select("pnl")
      .in("decision_id", decisionIdsToday)
      .eq("status", "settled")
      .gte("settled_at", dayStart);
    n = (settledToday ?? []).length;
    pnlToday = (settledToday ?? []).reduce((sum, o) => sum + (o.pnl ?? 0), 0);
  }

  const { data: priorStats } = await supabase
    .from("alpha_strategy_stats")
    .select("pnl_total")
    .eq("strategy_id", strategy.id)
    .lt("day", day)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pnlTotal = (priorStats?.pnl_total ?? 0) + pnlToday;

  // --- Everything below is new: pull the FULL settled-order history (not
  // just today's subset) to compute the Level-2 scoring metrics.
  const { data: decisionsAll } = await supabase
    .from("alpha_decisions")
    .select("id, run_id, market_id, model_prob")
    .eq("strategy_id", strategy.id)
    .eq("status", "accepted");
  const decisionRows: DecisionRow[] = decisionsAll ?? [];
  const decisionIdsAll = decisionRows.map((d) => d.id);
  const decisionById = new Map(decisionRows.map((d) => [d.id, d]));

  let settledOrders: SettledOrderRow[] = [];
  if (decisionIdsAll.length > 0) {
    const { data } = await supabase
      .from("alpha_orders")
      .select("id, decision_id, pnl, stake, price_or_odds, closing_price_or_odds, settled_at, outcome")
      .in("decision_id", decisionIdsAll)
      .eq("status", "settled");
    settledOrders = data ?? [];
  }

  const returns = settledOrders.filter((o) => o.pnl != null && o.stake > 0).map((o) => o.pnl! / o.stake);
  const roi = returns.length > 0 ? bootstrapRoiCI(returns) : null;
  const hr = returns.length > 0 ? hitRate(returns) : null;
  const mdd = returns.length > 0 ? maxDrawdown(returns) : null;

  const pnlByDay = new Map<string, number>();
  for (const o of settledOrders) {
    if (o.pnl == null || !o.settled_at) continue;
    const dayKey = o.settled_at.slice(0, 10);
    pnlByDay.set(dayKey, (pnlByDay.get(dayKey) ?? 0) + o.pnl);
  }
  const sharpe = pnlByDay.size >= 2 ? sharpeLike([...pnlByDay.values()]) : null;

  const clvValues: number[] = [];
  for (const o of settledOrders) {
    const v = clvForOrder(strategy.venue, o.price_or_odds, o.closing_price_or_odds);
    if (v != null) clvValues.push(v);
  }
  const clv = mean(clvValues);

  let brier: number | null = null;
  let rpsScore: number | null = null;
  if (strategy.venue === "zoqo-sportsbook") {
    const brierValues: number[] = [];
    for (const o of settledOrders) {
      if (o.outcome === "void") continue; // no realized win/loss to score a forecast against
      const decision = decisionById.get(o.decision_id);
      if (!decision || decision.model_prob == null) continue;
      brierValues.push(brierOf(decision.model_prob, o.outcome === "won"));
    }
    brier = mean(brierValues);

    // RPS: group by (run_id, fixtureId) — see this file's header for why
    // only a fixture where all three outcomes were logged in the SAME run
    // yields a usable predicted distribution.
    const groups = new Map<string, { home?: number; draw?: number; away?: number; fixtureId: string }>();
    for (const d of decisionRows) {
      if (d.model_prob == null) continue;
      const parsed = parseSportsbookMarketId(d.market_id);
      if (!parsed || parsed.market !== "1x2") continue;
      const key = `${d.run_id ?? "no-run"}:${parsed.fixtureId}`;
      const g = groups.get(key) ?? { fixtureId: parsed.fixtureId };
      (g as Record<string, number | string>)[parsed.outcome] = d.model_prob;
      groups.set(key, g);
    }
    const usableGroups = [...groups.values()].filter((g) => g.home != null && g.draw != null && g.away != null);
    if (usableGroups.length > 0) {
      const fixtureIds = [...new Set(usableGroups.map((g) => g.fixtureId))];
      const { data: fixtures } = await supabase.from("alpha_fixtures").select("id, status, home_goals, away_goals").in("id", fixtureIds);
      const fixtureById = new Map((fixtures ?? []).map((f) => [f.id, f]));
      const rpsValues: number[] = [];
      for (const g of usableGroups) {
        const fixture = fixtureById.get(g.fixtureId);
        if (!fixture || !FIXTURE_COMPLETED_STATUSES.has(fixture.status) || fixture.home_goals == null || fixture.away_goals == null) continue;
        const actual = outcomeFromScore(fixture.home_goals, fixture.away_goals);
        rpsValues.push(rpsOf({ home: g.home!, draw: g.draw!, away: g.away! }, actual));
      }
      rpsScore = mean(rpsValues);
    }
  }

  return { n, pnlToday, pnlTotal, nSamples: settledOrders.length, roi, hitRate: hr, maxDrawdown: mdd, sharpe, clv, brier, rps: rpsScore };
}

// ---------------------------------------------------------------------------
// Orchestration: compute every strategy's stats, then reallocate budget
// PER OWNER (Level 3) so one user's strategies never influence another's
// pool, then write everything.
// ---------------------------------------------------------------------------

interface StrategyRow {
  id: string;
  user_id: string;
  venue: string;
  enabled: boolean;
  budget: number;
  budget_floor: number;
  strategy_key: string;
}

export async function evaluateStrategies(supabase: Client, now: number = Date.now()) {
  const { data: strategies } = await supabase
    .from("alpha_strategies")
    .select("id, user_id, venue, enabled, budget, budget_floor, strategy_key");
  if (!strategies || strategies.length === 0) return { evaluated: 0, autoPaused: 0 };

  const day = todayDate(now);
  const dayStart = dayStartIso(now);

  const statsByStrategy = new Map<string, ComputedStats>();
  for (const strategy of strategies as StrategyRow[]) {
    statsByStrategy.set(strategy.id, await computeStrategyStats(supabase, strategy, day, dayStart));
  }

  // Group by owner — a bandit reallocating one user's capital must not be
  // influenced by another user's strategies (see budgetRule.ts's own header
  // and this phase's brief).
  const strategiesByOwner = new Map<string, StrategyRow[]>();
  for (const strategy of strategies as StrategyRow[]) {
    const list = strategiesByOwner.get(strategy.user_id) ?? [];
    list.push(strategy);
    strategiesByOwner.set(strategy.user_id, list);
  }

  const decisionsById = new Map<string, ReallocationDecision>();
  for (const ownerStrategies of strategiesByOwner.values()) {
    const snapshots: StrategySnapshot[] = ownerStrategies.map((s) => {
      const stats = statsByStrategy.get(s.id)!;
      return {
        id: s.id,
        currentBudget: s.budget,
        budgetFloor: s.budget_floor,
        nSamples: stats.nSamples,
        roi: stats.roi,
        manuallyPaused: !s.enabled,
      };
    });
    for (const decision of reallocate(snapshots, undefined, DEFAULT_MIN_SAMPLES)) {
      decisionsById.set(decision.id, decision);
    }
  }

  let evaluated = 0;
  let autoPaused = 0;
  for (const strategy of strategies as StrategyRow[]) {
    const stats = statsByStrategy.get(strategy.id)!;
    const decision = decisionsById.get(strategy.id);
    const newBudget = decision?.newBudget ?? strategy.budget;

    await supabase.from("alpha_strategy_stats").upsert(
      {
        strategy_id: strategy.id,
        day,
        n: stats.n,
        pnl_today: stats.pnlToday,
        pnl_total: stats.pnlTotal,
        roi: stats.roi?.mean ?? null,
        roi_ci_low: stats.roi?.low ?? null,
        roi_ci_high: stats.roi?.high ?? null,
        hit_rate: stats.hitRate,
        brier: stats.brier,
        rps: stats.rps,
        clv: stats.clv,
        max_drawdown: stats.maxDrawdown,
        sharpe: stats.sharpe,
        budget_after: newBudget,
      },
      { onConflict: "strategy_id,day" },
    );

    const strategyPatch: Record<string, unknown> = { budget: newBudget };
    if (decision?.autoPause) {
      strategyPatch.enabled = false;
      strategyPatch.paused_reason = decision.reason;
    }
    await supabase
      .from("alpha_strategies")
      .update(strategyPatch as never)
      .eq("id", strategy.id);

    if (decision?.autoPause) {
      await supabase.from("alpha_events").insert({
        user_id: strategy.user_id,
        strategy_id: strategy.id,
        kind: "paused",
        payload: { reason: decision.reason, auto: true },
      });
      autoPaused++;
    }

    evaluated++;
  }

  // Copy-trading measurement (docs/alpha/08-copy-trading.md §4, "Nightly,
  // per source and per copy strategy") — logged to alpha_events rather than
  // a new alpha_strategy_stats column (that table's schema is Phase 0's,
  // not extended by this pass): the gap numbers are exactly what
  // `get_copy_gap`/`getCopyGap` compute on demand, just also captured once
  // a day per copy strategy for a visible history instead of only ever
  // being query-on-request.
  for (const strategy of strategies as StrategyRow[]) {
    if (!COPY_STRATEGY_KEYS.has(strategy.strategy_key)) continue;
    const { data: decisions } = await supabase
      .from("alpha_decisions")
      .select("*, alpha_orders(*)")
      .eq("strategy_id", strategy.id)
      .eq("user_id", strategy.user_id)
      .not("source_id", "is", null);
    const outcomes: CopyDecisionOutcome[] = (decisions ?? []).map((d) => {
      const orders = (d as unknown as { alpha_orders: { pnl: number | null; stake: number | null; price_or_odds: number | null; closing_price_or_odds: number | null }[] }).alpha_orders ?? [];
      const order = orders[0];
      return {
        lagMs: d.lag_ms,
        ourReturn: order?.pnl != null && order.stake ? order.pnl / order.stake : null,
        ourClv: order?.pnl != null && order?.closing_price_or_odds != null && order?.price_or_odds ? order.closing_price_or_odds / order.price_or_odds - 1 : null,
      };
    });
    if (outcomes.length === 0) continue;
    const gap = computeCopyGap(outcomes);
    await supabase.from("alpha_events").insert({
      user_id: strategy.user_id,
      strategy_id: strategy.id,
      kind: "info",
      payload: { kind: "copy_gap", day, ...gap } as never,
    });
  }

  return { evaluated, autoPaused };
}
