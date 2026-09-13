/** Bookmaker margin (overround) removal — pure math, no I/O.
 *
 *  Decimal odds always imply probabilities that sum to more than 1 because
 *  the book builds in a margin; before comparing a model's probability to
 *  "the market's" probability (docs/alpha/06-football-model.md §2's
 *  "Market features (strongest)"), that margin has to come out. This module
 *  gives two standard ways to do it, both taking `odds: number[]` (decimal
 *  odds for a market's mutually-exclusive, collectively-exhaustive outcomes
 *  — e.g. [home, draw, away] or [over, under]) and returning `number[]`
 *  probabilities that sum to 1.
 *
 *  - `multiplicativeNormalize`: the simple, standard approach — scale each
 *    outcome's raw implied probability (1/odds_i) down by the total
 *    overround. This is the default per 06-football-model.md §2.
 *  - `shinProbabilities`: Shin's (1993) method, which models the overround
 *    as arising from a fraction `z` of "insider" money the book defends
 *    against, and backs out probabilities net of that distortion. Source:
 *    Shin, H.S. (1993), "Measuring the Incidence of Insider Trading in a
 *    Market for State-Contingent Claims", The Economic Journal 103(420).
 *    The closed form for a single outcome given z is:
 *      p_i = (sqrt(z^2 + 4*(1-z)*z_i) - z) / (2*(1-z))   [z-normalized form
 *      below uses pi_i^2/sum(pi_j) in place of a bare pi_i^2 term, per the
 *      task spec's stated formula]
 *    z itself has no general closed form for 3+ outcomes, so it's solved by
 *    bounded bisection on the constraint sum(p_i) = 1.
 *
 *  Both are pure functions: same odds in, same probabilities out, no
 *  randomness, no shared state.
 */

const MAX_BISECTION_ITERATIONS = 100;
const BISECTION_TOLERANCE = 1e-9;

function assertValidOdds(odds: number[]): void {
  if (odds.length < 2) throw new Error("margin removal requires at least 2 outcomes");
  for (const o of odds) {
    if (!Number.isFinite(o) || o <= 1) {
      throw new Error(`invalid decimal odds: ${o} (must be finite and > 1)`);
    }
  }
}

/** Raw implied probabilities before any margin removal: `1/odds_i`. */
function rawImpliedProbabilities(odds: number[]): number[] {
  return odds.map((o) => 1 / o);
}

/** The bookmaker's overround/margin: `sum(1/odds_i) - 1`. Zero would mean a
 *  perfectly fair book; real books are typically 0.03-0.08 (3-8%). */
export function overround(odds: number[]): number {
  assertValidOdds(odds);
  return rawImpliedProbabilities(odds).reduce((a, b) => a + b, 0) - 1;
}

/** Multiplicative normalization: each outcome's raw implied probability
 *  scaled down proportionally so the set sums to 1. This is the standard,
 *  simplest margin-removal method and the default per
 *  docs/alpha/06-football-model.md §2. */
export function multiplicativeNormalize(odds: number[]): number[] {
  assertValidOdds(odds);
  const pi = rawImpliedProbabilities(odds);
  const total = pi.reduce((a, b) => a + b, 0);
  return pi.map((p) => p / total);
}

/** Given z and the raw implied probabilities pi_i, compute Shin's p_i per
 *  the task spec's formula:
 *    p_i = (sqrt(z^2 + 4*(1-z)*(pi_i^2 / sum(pi_j))) - z) / (2*(1-z))
 *  z=0 degenerates to the multiplicative-normalization result. */
function shinProbabilitiesForZ(pi: number[], z: number): number[] {
  const sumPi = pi.reduce((a, b) => a + b, 0);
  if (z <= 0) return pi.map((p) => p / sumPi);
  const denom = 2 * (1 - z);
  return pi.map((p) => {
    const inner = z * z + 4 * (1 - z) * ((p * p) / sumPi);
    return (Math.sqrt(Math.max(0, inner)) - z) / denom;
  });
}

/** Shin's (1993) method for removing the bookmaker margin. Solves for the
 *  single insider-trading parameter z (0 <= z < 1) such that the resulting
 *  probabilities sum to 1, via bounded bisection (no closed form exists for
 *  3+ outcomes). Capped at `MAX_BISECTION_ITERATIONS` iterations / a
 *  `BISECTION_TOLERANCE` residual — never an unbounded loop. */
export function shinProbabilities(odds: number[]): number[] {
  assertValidOdds(odds);
  const pi = rawImpliedProbabilities(odds);

  // f(z) = sum(p_i(z)) - 1. f(0) = overround > 0 for a real book (raw
  // implied probs sum to > 1); f approaching 1 drives p_i(z) -> a sum that
  // also must be checked. We bisect z in [0, zHigh) where zHigh is just
  // under 1 to keep 1/(1-z) finite.
  let lo = 0;
  let hi = 1 - 1e-9;

  const f = (z: number) => shinProbabilitiesForZ(pi, z).reduce((a, b) => a + b, 0) - 1;

  const fLo = f(lo);
  // If the book is already fair or inverted (fLo <= 0), z=0 (multiplicative
  // normalization) is the best available answer — bisection has nothing to
  // search for.
  if (fLo <= 0) return shinProbabilitiesForZ(pi, 0);

  let fHi = f(hi);
  // f is decreasing in z; if even z->1 doesn't cross 0, fall back to the
  // closest boundary we evaluated rather than looping forever.
  if (fHi > 0) {
    return shinProbabilitiesForZ(pi, hi);
  }

  let mid = lo;
  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i++) {
    mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < BISECTION_TOLERANCE) break;
    if (fMid > 0) {
      lo = mid;
    } else {
      hi = mid;
      fHi = fMid;
    }
    if (hi - lo < BISECTION_TOLERANCE) break;
  }
  void fHi;

  return shinProbabilitiesForZ(pi, mid);
}

export type MarginMethod = "multiplicative" | "shin";

/** Dispatch helper so callers (e.g. football/models.ts's `market` model)
 *  can take a `MarginMethod` parameter instead of importing both functions. */
export function removeMargin(odds: number[], method: MarginMethod = "multiplicative"): number[] {
  return method === "shin" ? shinProbabilities(odds) : multiplicativeNormalize(odds);
}
