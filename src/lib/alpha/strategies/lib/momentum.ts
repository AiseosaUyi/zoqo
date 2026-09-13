/** Shared "N-window return sign + ATR-derived stop" momentum core, factored
 *  out of `terminalHourlyMomentum.ts` when `bybitHourlyMomentum.ts` became
 *  its second consumer (docs/alpha/plans/phase-4-extra-venues.md's own DRY
 *  note — the Phase 4 plan review flagged copy-pasting this a second time
 *  as a code-quality issue and required this factoring instead). Pure and
 *  venue-agnostic: it knows nothing about zoqo-terminal or bybit-demo, only
 *  numbers, so it's trivially unit-testable and reusable by a third
 *  price-quoted venue later without touching either strategy file again. */

export interface MomentumInputs {
  /** Current price of the asset. */
  price: number;
  /** ATR (or ATR proxy, see priceFeatures.ts's priceOnlyAtr) over the same
   *  lookback window the caller sourced `returnOverWindow` from. */
  atr: number;
  /** Signed fractional return over the strategy's lookback window (e.g. the
   *  trailing 4h return) — sign determines trade direction. */
  returnOverWindow: number;
  /** Stop distance = atr * atrMultiple (falls back to 2% of price when atr
   *  is non-finite or non-positive, e.g. too little history to compute one). */
  atrMultiple: number;
  /** Returns below this absolute magnitude are treated as noise, not signal. */
  minReturnAbs: number;
}

export interface MomentumSignal {
  side: "long" | "short";
  stopLoss: number;
  /** abs(returnOverWindow) — the edge magnitude callers pass straight through
   *  to `Intent.edge`. */
  edge: number;
}

/** Returns `null` when there's no tradeable signal (bad inputs, or the move
 *  is within the noise threshold) — callers turn that into "return []",
 *  never a fabricated flat trade. */
export function computeMomentumSignal(inputs: MomentumInputs): MomentumSignal | null {
  const { price, atr, returnOverWindow, atrMultiple, minReturnAbs } = inputs;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(returnOverWindow)) return null;
  if (Math.abs(returnOverWindow) < minReturnAbs) return null;

  const side: "long" | "short" = returnOverWindow > 0 ? "long" : "short";
  const stopDistance = Number.isFinite(atr) && atr > 0 ? atr * atrMultiple : price * 0.02;
  const stopLoss = side === "long" ? price - stopDistance : price + stopDistance;

  return { side, stopLoss, edge: Math.abs(returnOverWindow) };
}
