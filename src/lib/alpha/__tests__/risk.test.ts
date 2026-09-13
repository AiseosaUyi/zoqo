import { describe, expect, it } from "vitest";
import { evaluateIntent, MAX_OPEN_POSITIONS_PER_STRATEGY, MAX_EXPOSURE_PER_MARKET_PCT } from "../risk";
import type { RiskGateInput, RiskGateStrategyConfig, RiskGateVenueConfig } from "../risk";
import type { Intent } from "../core/venue";

function baseIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    strategyId: "s1",
    market: { venue: "zoqo-terminal", marketId: "BTC" },
    side: "buy",
    kind: "market",
    edge: 0.1,
    modelProb: 0.6,
    marketProb: 0.5,
    rationale: "test",
    ...overrides,
  };
}

function baseStrategy(overrides: Partial<RiskGateStrategyConfig> = {}): RiskGateStrategyConfig {
  return {
    id: "s1",
    enabled: true,
    budget: 1000,
    maxStake: 500,
    dailyCap: 500,
    spentToday: 0,
    dailyLossStop: 200,
    pnlToday: 0,
    kellyFraction: 0.25,
    minEdge: 0.02,
    maxOdds: null,
    cooldownMin: 60,
    withinScheduleWindow: true,
    openPositionsCount: 0,
    exposureByMarket: {},
    lastIntentAtByMarket: {},
    ...overrides,
  };
}

function baseVenue(overrides: Partial<RiskGateVenueConfig> = {}): RiskGateVenueConfig {
  return { enabled: true, maxStake: 500, dailyCap: 500, spentToday: 0, dailyLossStop: 200, pnlToday: 0, ...overrides };
}

function baseInput(overrides: Partial<RiskGateInput> = {}): RiskGateInput {
  return {
    intent: baseIntent(),
    now: 1_000_000,
    killSwitch: false,
    strategy: baseStrategy(),
    venue: baseVenue(),
    decimalOddsForSizing: 2,
    ...overrides,
  };
}

describe("evaluateIntent", () => {
  it("accepts a well-formed intent and sizes a positive stake", () => {
    const result = evaluateIntent(baseInput());
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.stake).toBeGreaterThan(0);
  });

  it("rejects on global kill switch", () => {
    expect(evaluateIntent(baseInput({ killSwitch: true }))).toEqual({ accepted: false, reason: "kill_switch" });
  });

  it("rejects when the venue is disabled", () => {
    const r = evaluateIntent(baseInput({ venue: baseVenue({ enabled: false }) }));
    expect(r).toEqual({ accepted: false, reason: "venue_disabled" });
  });

  it("rejects when the strategy is disabled", () => {
    const r = evaluateIntent(baseInput({ strategy: baseStrategy({ enabled: false }) }));
    expect(r).toEqual({ accepted: false, reason: "strategy_disabled" });
  });

  it("rejects outside the schedule window", () => {
    const r = evaluateIntent(baseInput({ strategy: baseStrategy({ withinScheduleWindow: false }) }));
    expect(r).toEqual({ accepted: false, reason: "outside_schedule_window" });
  });

  it("rejects on the strategy daily loss stop", () => {
    const r = evaluateIntent(baseInput({ strategy: baseStrategy({ pnlToday: -200 }) }));
    expect(r).toEqual({ accepted: false, reason: "strategy_daily_loss_stop" });
  });

  it("rejects on the venue daily loss stop", () => {
    const r = evaluateIntent(baseInput({ venue: baseVenue({ pnlToday: -250 }) }));
    expect(r).toEqual({ accepted: false, reason: "venue_daily_loss_stop" });
  });

  it("rejects at the max open positions cap", () => {
    const r = evaluateIntent(
      baseInput({ strategy: baseStrategy({ openPositionsCount: MAX_OPEN_POSITIONS_PER_STRATEGY }) }),
    );
    expect(r).toEqual({ accepted: false, reason: "max_open_positions" });
  });

  it("rejects when a market is already at its exposure cap", () => {
    const r = evaluateIntent(
      baseInput({
        strategy: baseStrategy({ exposureByMarket: { BTC: 1000 * MAX_EXPOSURE_PER_MARKET_PCT } }),
      }),
    );
    expect(r).toEqual({ accepted: false, reason: "max_exposure_per_market" });
  });

  it("rejects a repeat intent on the same market within the cooldown", () => {
    const r = evaluateIntent(
      baseInput({
        now: 1_000_000,
        strategy: baseStrategy({ cooldownMin: 60, lastIntentAtByMarket: { BTC: 1_000_000 - 30 * 60_000 } }),
      }),
    );
    expect(r).toEqual({ accepted: false, reason: "cooldown" });
  });

  it("allows a repeat intent once the cooldown has elapsed", () => {
    const r = evaluateIntent(
      baseInput({
        now: 1_000_000,
        strategy: baseStrategy({ cooldownMin: 60, lastIntentAtByMarket: { BTC: 1_000_000 - 61 * 60_000 } }),
      }),
    );
    expect(r.accepted).toBe(true);
  });

  it("rejects below the minimum edge threshold", () => {
    const r = evaluateIntent(baseInput({ intent: baseIntent({ edge: 0.01 }), strategy: baseStrategy({ minEdge: 0.02 }) }));
    expect(r).toEqual({ accepted: false, reason: "below_min_edge" });
  });

  it("rejects above the maximum odds", () => {
    const r = evaluateIntent(
      baseInput({ decimalOddsForSizing: 20, strategy: baseStrategy({ maxOdds: 10 }) }),
    );
    expect(r).toEqual({ accepted: false, reason: "above_max_odds" });
  });

  it("rejects a non-positive Kelly stake (no real edge despite intent.edge)", () => {
    // modelProb == fair probability implied by decimalOddsForSizing=2 -> zero Kelly.
    const r = evaluateIntent(baseInput({ intent: baseIntent({ modelProb: 0.5 }) }));
    expect(r).toEqual({ accepted: false, reason: "non_positive_kelly_stake" });
  });

  it("caps the stake at the strategy's max_stake", () => {
    const r = evaluateIntent(
      baseInput({
        intent: baseIntent({ modelProb: 0.99 }),
        strategy: baseStrategy({ maxStake: 5, budget: 100_000, dailyCap: 100_000 }),
        venue: baseVenue({ maxStake: 100_000, dailyCap: 100_000 }),
      }),
    );
    expect(r).toEqual({ accepted: true, stake: 5 });
  });

  it("caps the stake at the venue's max_stake", () => {
    const r = evaluateIntent(
      baseInput({
        intent: baseIntent({ modelProb: 0.99 }),
        strategy: baseStrategy({ maxStake: 100_000, budget: 100_000, dailyCap: 100_000 }),
        venue: baseVenue({ maxStake: 7, dailyCap: 100_000 }),
      }),
    );
    expect(r).toEqual({ accepted: true, stake: 7 });
  });

  it("caps the stake at the strategy's remaining daily cap", () => {
    const r = evaluateIntent(
      baseInput({
        intent: baseIntent({ modelProb: 0.99 }),
        strategy: baseStrategy({ maxStake: 100_000, budget: 100_000, dailyCap: 50, spentToday: 47 }),
        venue: baseVenue({ maxStake: 100_000, dailyCap: 100_000 }),
      }),
    );
    expect(r).toEqual({ accepted: true, stake: 3 });
  });

  it("rejects with no_budget_room when the remaining daily cap is exhausted", () => {
    const r = evaluateIntent(
      baseInput({
        intent: baseIntent({ modelProb: 0.99 }),
        strategy: baseStrategy({ dailyCap: 50, spentToday: 50 }),
      }),
    );
    expect(r).toEqual({ accepted: false, reason: "no_budget_room" });
  });
});
