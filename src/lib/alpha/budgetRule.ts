/** Nightly capital re-allocation (docs/alpha/03-architecture.md §7 Level 3)
 *  — pure math, no I/O, same discipline as `kelly.ts`/`risk.ts`. This is a
 *  conservative sample-size-aware bandit, not a neural net, exactly as the
 *  architecture doc frames it: "start equal; after min_samples allocate
 *  proportional to max(0, lower CI bound of ROI) with a floor so no
 *  strategy goes to zero while it is still collecting samples; strategies
 *  with negative upper CI bound are auto-paused."
 *
 *  `roi` here is whatever `src/lib/alpha/football/metrics.ts`'s
 *  `bootstrapRoiCI` produced for a strategy's settled-order returns — that
 *  module's name is football-specific but `bootstrapRoiCI`/`hitRate`/
 *  `maxDrawdown`/`sharpeLike` are domain-agnostic and reused here for every
 *  venue's strategies, not just football ones; `evaluate.ts` is the caller
 *  that wires the two together. */

export interface StrategySnapshot {
  id: string;
  /** Current allocation before this reallocation pass. */
  currentBudget: number;
  /** Never allocate below this, even to a paused strategy — matches
   *  `alpha_strategies.budget_floor` (docs/alpha/04-schema.md). */
  budgetFloor: number;
  /** Count of settled bets/trades this strategy has ever produced. */
  nSamples: number;
  /** Bootstrap ROI CI from `bootstrapRoiCI`, or `null` if there aren't
   *  enough settled orders yet to compute one meaningfully. */
  roi: { mean: number; low: number; high: number } | null;
  /** Already paused for a reason unrelated to this rule (e.g. a human
   *  paused it, or the daily loss stop tripped) — this rule never
   *  un-pauses a strategy someone else paused; it only ever pauses new
   *  ones and reallocates budget among the ones still running. */
  manuallyPaused: boolean;
}

export interface ReallocationDecision {
  id: string;
  newBudget: number;
  /** True when THIS rule is the one pausing it (negative upper CI bound —
   *  confirmed losing with statistical confidence). Does not distinguish
   *  from a pre-existing manual pause; the caller (evaluate.ts) already
   *  knows that from `manuallyPaused` and shouldn't double-write an event
   *  for a strategy that was already paused. */
  autoPause: boolean;
  reason: string;
}

export const DEFAULT_MIN_SAMPLES = 50;

/** `strategies` should be the full set sharing one budget pool (typically:
 *  one user's enabled strategies, possibly scoped further by venue if
 *  venues are meant to have independent pools — `evaluate.ts` decides the
 *  grouping, this function just redistributes whatever set it's given).
 *  `totalBudget` defaults to the sum of current budgets — reallocating
 *  redistributes existing capital, it doesn't invent new money. */
export function reallocate(strategies: StrategySnapshot[], totalBudget?: number, minSamples: number = DEFAULT_MIN_SAMPLES): ReallocationDecision[] {
  const pool = totalBudget ?? strategies.reduce((sum, s) => sum + s.currentBudget, 0);

  const decisions = new Map<string, ReallocationDecision>();
  const eligible: StrategySnapshot[] = [];

  for (const s of strategies) {
    if (s.manuallyPaused) {
      decisions.set(s.id, { id: s.id, newBudget: s.budgetFloor, autoPause: false, reason: "already paused (not this rule's concern)" });
      continue;
    }
    // Negative upper CI bound = even the optimistic end of the confidence
    // interval is a loss — statistically confirmed losing, not just an
    // unlucky streak. Auto-pause, still leave the floor allocated so
    // re-enabling it later doesn't start from zero.
    if (s.roi != null && s.nSamples >= minSamples && s.roi.high < 0) {
      decisions.set(s.id, { id: s.id, newBudget: s.budgetFloor, autoPause: true, reason: `negative upper ROI CI bound (${s.roi.high.toFixed(4)}) at n=${s.nSamples}` });
      continue;
    }
    eligible.push(s);
  }

  if (eligible.length === 0) return [...decisions.values()];

  const weight = (s: StrategySnapshot): number => (s.nSamples < minSamples || s.roi == null ? 1 : Math.max(0, s.roi.low));
  const weights = eligible.map(weight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Every eligible strategy's weight came out to 0 (all mature and all at
  // or below break-even at the lower CI bound) — fall back to an equal
  // split rather than let the proportional rule zero everyone out. This is
  // the "floor so no strategy goes to zero" guarantee in aggregate; the
  // per-strategy budgetFloor below is the same guarantee per-strategy.
  const useEqualSplit = totalWeight <= 0;

  for (let i = 0; i < eligible.length; i++) {
    const s = eligible[i];
    const share = useEqualSplit ? 1 / eligible.length : weights[i] / totalWeight;
    const rawBudget = share * pool;
    const newBudget = Math.max(s.budgetFloor, rawBudget);
    const reason = useEqualSplit
      ? "equal split (no strategy has a positive lower-CI ROI yet)"
      : s.nSamples < minSamples || s.roi == null
        ? `under min_samples (${s.nSamples}/${minSamples}) — equal-weighted bucket`
        : `proportional to lower ROI CI bound (${s.roi.low.toFixed(4)})`;
    decisions.set(s.id, { id: s.id, newBudget, autoPause: false, reason });
  }

  return [...decisions.values()];
}
