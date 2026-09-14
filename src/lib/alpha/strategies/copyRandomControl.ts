import type { Strategy } from "../core/strategy";
import { evaluateCopyStrategy, COPY_TRADING_DEFAULTS, type CopyTradingParams } from "./lib/copyTrading";

/** The control every copy strategy is measured against (docs/alpha/
 *  08-copy-trading.md §4/§7): follows randomly chosen active accounts (not
 *  the confirmed-followed set) with the exact same detection/sizing/filter
 *  mechanics. Works on either venue this program copy-trades on — a single
 *  instance is still bound to one venue at creation time (`alpha_strategies.
 *  venue`), same as every other strategy; `ctx.venue.id` picks which
 *  detect function applies rather than hard-coding one venue in this file. */
const DEFAULT_PARAMS: CopyTradingParams = { ...COPY_TRADING_DEFAULTS };

export const copyRandomControl: Strategy = {
  key: "copy-random-control",
  venues: ["polymarket-sim", "manifold"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<CopyTradingParams>) };
    return evaluateCopyStrategy(ctx, params, ctx.venue.id, true);
  },
};
