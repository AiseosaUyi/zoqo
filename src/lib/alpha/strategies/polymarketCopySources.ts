import type { Strategy } from "../core/strategy";
import { evaluateCopyStrategy, COPY_TRADING_DEFAULTS, type CopyTradingParams } from "./lib/copyTrading";

/** Follows the confirmed Polymarket source set (docs/alpha/08-copy-trading.md
 *  §7) on `polymarket-sim` — simulated fills against the real order book,
 *  zero real money. Actual detection/sizing/filter logic lives in
 *  `strategies/lib/copyTrading.ts`, shared with `manifoldCopySources.ts`. */
const DEFAULT_PARAMS: CopyTradingParams = { ...COPY_TRADING_DEFAULTS };

export const polymarketCopySources: Strategy = {
  key: "polymarket-copy-sources",
  venues: ["polymarket-sim"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<CopyTradingParams>) };
    return evaluateCopyStrategy(ctx, params, "polymarket-sim", false);
  },
};
