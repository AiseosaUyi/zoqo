/** Fractional Kelly sizing — pure math, no I/O. Used by risk.ts as one of
 *  several caps on stake size (docs/alpha/03-architecture.md §5 step 3,
 *  docs/alpha/06-football-model.md §3's betting rule). Ported from the
 *  standard Kelly criterion for a binary bet at decimal odds; see
 *  martineastwood/penaltyblog (MIT) for the reference implementation this
 *  follows the same formula as (docs/alpha/02-market-landscape.md §5). */

/** `modelProb`: this program's calibrated probability the bet wins.
 *  `decimalOdds`: what the venue pays out per unit staked (e.g. 2.5 means
 *  a win returns 2.5x the stake, so net profit per unit is 1.5).
 *  `fraction`: fractional-Kelly multiplier (default 0.25 — full Kelly is
 *  well known to be too volatile for this program's risk tolerance).
 *  Returns a stake fraction of bankroll in [0, 1]; 0 whenever the edge is
 *  non-positive or the inputs are out of domain. */
export function kellyFraction(modelProb: number, decimalOdds: number, fraction = 0.25): number {
  if (decimalOdds <= 1 || modelProb <= 0 || modelProb >= 1 || fraction <= 0) return 0;
  const b = decimalOdds - 1;
  const q = 1 - modelProb;
  const fullKelly = (b * modelProb - q) / b;
  return Math.min(1, Math.max(0, fullKelly)) * fraction;
}

/** Convenience for venues that speak in edge (modelProb - marketProb) and a
 *  price rather than decimal odds directly — e.g. a terminal momentum
 *  strategy sizing off a directional edge rather than a priced outcome.
 *  `impliedDecimalOdds` lets a price-based venue supply a synthetic "odds"
 *  (1 / marketProb) so the same formula applies uniformly across venue
 *  types, per docs/alpha/03-architecture.md §5's single risk gate. */
export function kellyFractionFromEdge(edge: number, marketProb: number, fraction = 0.25): number {
  if (marketProb <= 0 || marketProb >= 1) return 0;
  const modelProb = marketProb + edge;
  if (modelProb <= 0 || modelProb >= 1) return 0;
  const impliedDecimalOdds = 1 / marketProb;
  return kellyFraction(modelProb, impliedDecimalOdds, fraction);
}
