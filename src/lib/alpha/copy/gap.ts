/** Copy gap computation (docs/alpha/08-copy-trading.md §4/§8) — extracted
 *  pure so it's unit-tested on a synthetic fixture without a Supabase
 *  client, same split as `sources.ts`'s `scoreSource`/`runSourceScreen`.
 *  `service.getCopyGap` is the thin DB-fetching wrapper. */

export interface CopyDecisionOutcome {
  lagMs: number | null;
  /** Realized pnl / stake for a settled copy, or `null` if not yet settled. */
  ourReturn: number | null;
  /** `closingPriceOrOdds / priceOrOdds - 1`, or `null` if either is
   *  missing (unsettled, or the venue has no honest probability reading —
   *  same convention `evaluate.ts` already uses for per-venue CLV). */
  ourClv: number | null;
}

export interface CopyGapResult {
  n: number;
  ourReturn: number | null;
  ourClv: number | null;
  lagMsP50: number | null;
  lagMsMin: number | null;
  lagMsMax: number | null;
}

export function computeCopyGap(outcomes: CopyDecisionOutcome[]): CopyGapResult {
  const lagValues = outcomes.map((o) => o.lagMs).filter((v): v is number => v != null).sort((a, b) => a - b);
  const returns = outcomes.map((o) => o.ourReturn).filter((v): v is number => v != null);
  const clvs = outcomes.map((o) => o.ourClv).filter((v): v is number => v != null);

  return {
    n: outcomes.length,
    ourReturn: returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null,
    ourClv: clvs.length > 0 ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
    lagMsP50: lagValues.length > 0 ? lagValues[Math.floor(lagValues.length / 2)] : null,
    lagMsMin: lagValues[0] ?? null,
    lagMsMax: lagValues[lagValues.length - 1] ?? null,
  };
}
