import type { Strategy } from "../core/strategy";
import { evaluateCopyStrategy, COPY_TRADING_DEFAULTS, type CopyTradingParams } from "./lib/copyTrading";

/** Follows the confirmed Manifold source set (docs/alpha/08-copy-trading.md
 *  §7) on `manifold` — real play-money execution, zero real money. */
const DEFAULT_PARAMS: CopyTradingParams = { ...COPY_TRADING_DEFAULTS };

export const manifoldCopySources: Strategy = {
  key: "manifold-copy-sources",
  venues: ["manifold"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<CopyTradingParams>) };
    return evaluateCopyStrategy(ctx, params, "manifold", false);
  },
};
