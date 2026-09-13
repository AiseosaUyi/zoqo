/** The one fully live-network-independent proof point for Phase 3
 *  (docs/alpha/plans/phase-3-football.md's own framing): walk-forward
 *  evaluate `market`, `dixon-coles`, `elo`, and `blend` against the frozen
 *  synthetic fixture set in `../__fixtures__/sample-fixtures.json`, via the
 *  extracted, reusable `runFootballBacktest` (`../backtest.ts`) — this test
 *  used to inline the walk-forward logic itself; it now just asserts on
 *  that function's output, per this task's "extract into backtest.ts and
 *  have the test import it" instruction. The math and its walk-forward
 *  discipline are unchanged; see `../backtest.ts`'s own header for the
 *  full explanation of both.
 *
 *  IMPORTANT: that fixture file is SYNTHETIC data (see its own README) —
 *  favorites are simulated to win more, with real Poisson variance, and
 *  "closing odds" are the true probability plus a modest synthetic
 *  overround. It is NOT real historical football data. The point of this
 *  test is to exercise the math (fitting, prediction, RPS) end-to-end and
 *  prove it behaves sanely — not to produce a number anyone should quote
 *  as evidence about real football betting markets.
 */
import { describe, expect, it } from "vitest";
import fixturesJson from "../__fixtures__/sample-fixtures.json";
import { runFootballBacktest, type BacktestFixtureInput } from "../backtest";

const fixtures = fixturesJson as BacktestFixtureInput[];

describe("football backtest (synthetic fixtures — see __fixtures__/README.md)", () => {
  const result = runFootballBacktest(fixtures);

  it("has a non-trivial train/test split", () => {
    expect(result.trainCount).toBeGreaterThan(100);
    expect(result.testCount).toBeGreaterThan(50);
  });

  it("keeps every model's mean RPS in a sane range (0 to ~0.67 for a well-behaved 3-outcome RPS)", () => {
    for (const stats of Object.values(result.models)) {
      expect(stats.meanRps).toBeGreaterThan(0);
      expect(stats.meanRps).toBeLessThan(0.67);
    }
  });

  it("keeps blend's RPS close to market's RPS — market is the baseline everything is expected to roughly track", () => {
    // docs/alpha/06-football-model.md's own real-data bound is ~0.005; this
    // synthetic dataset is smaller (90 test fixtures vs. the real pipeline's
    // eventual thousands), noisier (independent-Poisson ground truth with
    // real sampling variance, not real football's fuller feature set), and
    // its "market" odds are a close-to-true-probability construction (see
    // __fixtures__/README.md) rather than a real bookmaker's line — so a
    // much looser 0.05 tolerance is the honest bound for what this test can
    // actually prove: that blend behaves sanely relative to market, not
    // that it matches real-market-grade calibration.
    expect(Math.abs(result.models.blend.meanRps - result.models.market.meanRps)).toBeLessThan(0.05);
  });

  it("does not let the dixon-coles-only model perform wildly worse than market/blend", () => {
    // A basic sanity check, not a tight scientific bound, per the task
    // brief — dixon-coles alone has no market information at all, so some
    // gap is expected, but it shouldn't be catastrophic on data this
    // structured (favorites really do win more often here).
    expect(result.models.dixonColes.meanRps).toBeLessThan(result.models.market.meanRps + 0.15);
  });

  it("gives elo a sane RPS too, even though it is the crudest model here", () => {
    expect(result.models.elo.meanRps).toBeLessThan(result.models.market.meanRps + 0.2);
  });

  it("reports a bootstrap ROI CI and hit rate for the blend model whenever its betting rule fires at least once", () => {
    if (result.models.blend.nBets && result.models.blend.nBets > 0) {
      expect(result.models.blend.roi).toBeDefined();
      expect(result.models.blend.hitRate).toBeGreaterThanOrEqual(0);
      expect(result.models.blend.hitRate).toBeLessThanOrEqual(1);
    } else {
      expect(result.models.blend.roi).toBeUndefined();
    }
  });
});
