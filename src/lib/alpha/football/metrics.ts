/** Evaluation metrics for football predictions and the bets built from them
 *  — pure math, no I/O. Per docs/alpha/06-football-model.md §4: RPS/Brier
 *  score every model against the market on the same fixtures; CLV is the
 *  first real evidence of edge; ROI is noise until CLV and sample size
 *  confirm it.
 */

import { mulberry32 } from "@/lib/math";
import type { OneXTwoProbabilities, OneXTwoOutcome } from "./types";

/** Ranked Probability Score for a 3-outcome ORDERED categorical
 *  (home/draw/away, in that conventional order — RPS is only meaningful
 *  for ordered outcomes, since it penalizes probability mass placed on
 *  categories "further" from the true one more than mass placed "closer").
 *  Source: Epstein, E.S. (1969), "A Scoring System for Probability
 *  Forecasts of Ranked Categories", Journal of Applied Meteorology 8(6);
 *  standard formula for r ordered categories:
 *    RPS = (1/(r-1)) * sum_{i=1}^{r-1} (cumP_i - cumE_i)^2
 *  where cumP_i/cumE_i are cumulative predicted/actual probability up to
 *  rank i. Lower is better; 0 = perfect, 1 = maximally wrong (all mass on
 *  the outcome furthest from what happened). */
export function rps(predicted: OneXTwoProbabilities, actualOutcome: OneXTwoOutcome): number {
  const cumP1 = predicted.home;
  const cumP2 = predicted.home + predicted.draw;
  const cumE1 = actualOutcome === "home" ? 1 : 0;
  const cumE2 = actualOutcome === "away" ? 0 : 1;
  return ((cumP1 - cumE1) ** 2 + (cumP2 - cumE2) ** 2) / 2;
}

/** Brier score for a single binary market outcome (BTTS, O/U, etc). Source:
 *  Brier, G.W. (1950), "Verification of Forecasts Expressed in Terms of
 *  Probability", Monthly Weather Review 78(1). `(predictedProb - actual)^2`
 *  where actual is 1 if the event happened, else 0. Range [0, 1], lower is
 *  better. */
export function brier(predictedProb: number, actualOutcome: boolean): number {
  const actual = actualOutcome ? 1 : 0;
  return (predictedProb - actual) ** 2;
}

/** Closing Line Value, in implied-probability terms: `closingImplied /
 *  takenImplied - 1`, positive = you beat the closing line (good).
 *
 *  CORRECTED from docs/alpha/06-football-model.md §4's original literal
 *  text ("CLV per bet: `taken_implied / closing_implied - 1`") — that
 *  formula has an inverted sign relative to the standard convention.
 *  Sports-betting literature states "beat the closing line" on decimal
 *  ODDS as `oddsTaken / oddsClosing - 1` (positive = you got paid more
 *  than the closing price implies you should have). Converting that
 *  odds-domain formula to implied probabilities (`prob = 1/odds`) gives
 *  `closingImplied / takenImplied - 1`, NOT `takenImplied / closingImplied
 *  - 1`: the doc's original formula would make a genuinely good bet (one
 *  that beat the closing line — `takenImplied < closingImplied`, since a
 *  lower implied probability means better/longer odds) return a
 *  *negative* number, silently inverting "positive = good" for every
 *  strategy's tracked CLV on the leaderboard and in the nightly evaluator.
 *  Fixed here rather than propagated, per docs/alpha/PROMPT-build-alpha.md's
 *  "where the docs and the code disagree, the code wins and you update
 *  the doc in the same commit" — 06-football-model.md §4 is updated
 *  alongside this file. */
export function clv(takenImplied: number, closingImplied: number): number {
  if (takenImplied <= 0) return 0;
  return closingImplied / takenImplied - 1;
}

/** Fraction of bets with a positive return. */
export function hitRate(returns: number[]): number {
  if (returns.length === 0) return 0;
  return returns.filter((r) => r > 0).length / returns.length;
}

/** Maximum peak-to-trough decline of the cumulative return curve built by
 *  running-summing `returns` in order. Returned in the same units as the
 *  input (e.g. pnl/stake ratio units, or currency units if `returns` are
 *  currency P&L) — always >= 0. */
export function maxDrawdown(returns: number[]): number {
  let cumulative = 0;
  let peak = 0;
  let worst = 0;
  for (const r of returns) {
    cumulative += r;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > worst) worst = drawdown;
  }
  return worst;
}

/** Mean-over-stdev of a daily P&L series. Explicitly NOT a real annualized
 *  Sharpe ratio (no risk-free rate, no annualization factor, no
 *  distributional assumptions checked) — named `sharpeLike` on purpose per
 *  docs/alpha/06-football-model.md §4's own hedged framing of these
 *  metrics as directional, not textbook-rigorous. Returns 0 for fewer than
 *  2 data points or zero variance (avoids a division by zero / a
 *  meaningless single-point ratio). */
export function sharpeLike(dailyPnl: number[]): number {
  if (dailyPnl.length < 2) return 0;
  const mean = dailyPnl.reduce((a, b) => a + b, 0) / dailyPnl.length;
  const variance = dailyPnl.reduce((a, b) => a + (b - mean) ** 2, 0) / (dailyPnl.length - 1);
  const stdev = Math.sqrt(variance);
  return stdev === 0 ? 0 : mean / stdev;
}

const MAX_BOOTSTRAP_ITERATIONS = 20_000;
const DEFAULT_BOOTSTRAP_ITERATIONS = 2_000;
const DEFAULT_BOOTSTRAP_SEED = 20260913; // arbitrary fixed seed for reproducibility, not a date-based "current time"

export interface BootstrapRoiCI {
  mean: number;
  low: number;
  high: number;
}

/** Bootstrap resampling for a confidence interval on mean ROI (or any
 *  per-bet return series — `returns` is a list of pnl/stake ratios).
 *  Resamples `returns` with replacement `iterations` times (capped at
 *  `MAX_BOOTSTRAP_ITERATIONS` regardless of what's requested — no unbounded
 *  loop), computes the resample mean each time, and reports the empirical
 *  `confidence`-level percentile interval plus the actual (non-resampled)
 *  sample mean.
 *
 *  Uses `mulberry32` (this repo's seeded PRNG, `@/lib/math`) rather than
 *  `Math.random()` so the same input always reproduces the same interval —
 *  required for a deterministic Vitest assertion on the CI bounds, per
 *  this repo's `src/lib/referrals.ts` precedent of seeded-not-random PRNG
 *  use for anything that needs to be reproducible. `seed` defaults to a
 *  fixed constant rather than varying by call, for the same reason;
 *  override it if a caller genuinely wants an independent resampling run. */
export function bootstrapRoiCI(
  returns: number[],
  iterations: number = DEFAULT_BOOTSTRAP_ITERATIONS,
  confidence: number = 0.95,
  seed: number = DEFAULT_BOOTSTRAP_SEED,
): BootstrapRoiCI {
  const n = returns.length;
  if (n === 0) return { mean: 0, low: 0, high: 0 };

  const cappedIterations = Math.min(Math.max(1, Math.floor(iterations)), MAX_BOOTSTRAP_ITERATIONS);
  const rng = mulberry32(seed);

  const resampleMeans: number[] = new Array(cappedIterations);
  for (let i = 0; i < cappedIterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(rng() * n);
      sum += returns[Math.min(idx, n - 1)];
    }
    resampleMeans[i] = sum / n;
  }
  resampleMeans.sort((a, b) => a - b);

  const alpha = 1 - Math.min(0.999, Math.max(0.5, confidence));
  const loIdx = Math.max(0, Math.floor((alpha / 2) * cappedIterations));
  const hiIdx = Math.min(cappedIterations - 1, Math.ceil((1 - alpha / 2) * cappedIterations) - 1);

  const mean = returns.reduce((a, b) => a + b, 0) / n;
  return { mean, low: resampleMeans[loIdx], high: resampleMeans[Math.max(loIdx, hiIdx)] };
}
