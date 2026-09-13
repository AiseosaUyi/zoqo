/** The risk gate (docs/alpha/03-architecture.md §5). Every intent, from a
 *  scheduled strategy run, a human's "Run now", or an MCP `place_intent`
 *  call, passes through `evaluateIntent` before any venue adapter is ever
 *  called. This module has zero I/O and zero Supabase imports on purpose —
 *  `service.ts` reads whatever rows it needs and passes plain data in, so
 *  every one of the 7 checks below is unit-testable without a database. */

import type { Intent } from "./core/venue";
import { kellyFraction } from "./kelly";

/** Exposure caps live here as fixed defaults rather than new schema columns
 *  — docs/alpha/04-schema.md doesn't give alpha_strategies a per-strategy
 *  max-open-positions or max-exposure-per-market column, so Phase 1 keeps
 *  these as conservative constants rather than inventing schema Phase 0
 *  didn't specify. Revisit if a later phase's real usage needs them
 *  per-strategy configurable. */
export const MAX_OPEN_POSITIONS_PER_STRATEGY = 10;
export const MAX_EXPOSURE_PER_MARKET_PCT = 0.5; // fraction of strategy budget

export interface RiskGateStrategyConfig {
  id: string;
  enabled: boolean;
  /** Current budget allocation available to size stakes against. */
  budget: number;
  maxStake: number;
  dailyCap: number;
  spentToday: number;
  dailyLossStop: number;
  /** Negative = net loss today. */
  pnlToday: number;
  kellyFraction: number;
  minEdge: number;
  maxOdds?: number | null;
  cooldownMin: number;
  /** Schedule window check — the caller (runner.ts) already knows whether
   *  `next_run_at <= now`; this flag is just that fact passed through so
   *  the gate can reject a call arriving outside it (e.g. a stale MCP
   *  `run_strategy_now` retry). */
  withinScheduleWindow: boolean;
  openPositionsCount: number;
  /** marketId -> current exposure (stake sum) on that market. */
  exposureByMarket: Record<string, number>;
  /** marketId -> ms timestamp of the last intent raised on that market. */
  lastIntentAtByMarket: Record<string, number>;
}

export interface RiskGateVenueConfig {
  enabled: boolean;
  maxStake: number;
  dailyCap: number;
  spentToday: number;
  dailyLossStop: number;
  pnlToday: number;
}

export interface RiskGateInput {
  intent: Intent;
  now: number;
  killSwitch: boolean;
  strategy: RiskGateStrategyConfig;
  venue: RiskGateVenueConfig;
  /** Decimal odds for odds-priced venues, or a synthetic 1/marketProb for
   *  price venues — whatever `kellyFraction` should size against. Required
   *  whenever `intent.modelProb` is set; sizing falls back to
   *  `suggestedStakePct` alone (still capped) when it's absent, e.g. for a
   *  venue that hasn't priced a probability at all. */
  decimalOddsForSizing?: number;
}

export type RiskGateResult = { accepted: true; stake: number } | { accepted: false; reason: string };

/** Every rejection reason string here is written verbatim to
 *  `alpha_decisions.reject_reason` by service.ts — keep them short and
 *  stable, they're the dataset the learning loop's "what got rejected and
 *  why" view reads. */
export function evaluateIntent(input: RiskGateInput): RiskGateResult {
  const { intent, now, killSwitch, strategy, venue, decimalOddsForSizing } = input;

  if (killSwitch) return { accepted: false, reason: "kill_switch" };
  if (!venue.enabled) return { accepted: false, reason: "venue_disabled" };
  if (!strategy.enabled) return { accepted: false, reason: "strategy_disabled" };
  if (!strategy.withinScheduleWindow) return { accepted: false, reason: "outside_schedule_window" };

  if (strategy.pnlToday <= -strategy.dailyLossStop) return { accepted: false, reason: "strategy_daily_loss_stop" };
  if (venue.pnlToday <= -venue.dailyLossStop) return { accepted: false, reason: "venue_daily_loss_stop" };

  if (strategy.openPositionsCount >= MAX_OPEN_POSITIONS_PER_STRATEGY) {
    return { accepted: false, reason: "max_open_positions" };
  }
  const marketExposure = strategy.exposureByMarket[intent.market.marketId] ?? 0;
  if (marketExposure >= strategy.budget * MAX_EXPOSURE_PER_MARKET_PCT) {
    return { accepted: false, reason: "max_exposure_per_market" };
  }
  const lastIntentAt = strategy.lastIntentAtByMarket[intent.market.marketId];
  if (lastIntentAt != null && now - lastIntentAt < strategy.cooldownMin * 60_000) {
    return { accepted: false, reason: "cooldown" };
  }

  if (intent.edge < strategy.minEdge) return { accepted: false, reason: "below_min_edge" };
  if (strategy.maxOdds != null && decimalOddsForSizing != null && decimalOddsForSizing > strategy.maxOdds) {
    return { accepted: false, reason: "above_max_odds" };
  }

  const kellyPct =
    intent.modelProb != null && decimalOddsForSizing != null
      ? kellyFraction(intent.modelProb, decimalOddsForSizing, strategy.kellyFraction)
      : (intent.suggestedStakePct ?? 0);
  if (kellyPct <= 0) return { accepted: false, reason: "non_positive_kelly_stake" };

  const strategyRemainingDailyCap = Math.max(0, strategy.dailyCap - strategy.spentToday);
  const venueRemainingDailyCap = Math.max(0, venue.dailyCap - venue.spentToday);
  const remainingMarketExposureRoom = strategy.budget * MAX_EXPOSURE_PER_MARKET_PCT - marketExposure;

  const stake = Math.min(
    kellyPct * strategy.budget,
    strategy.maxStake,
    venue.maxStake,
    strategyRemainingDailyCap,
    venueRemainingDailyCap,
    remainingMarketExposureRoom,
  );

  if (stake <= 0) return { accepted: false, reason: "no_budget_room" };
  return { accepted: true, stake };
}
