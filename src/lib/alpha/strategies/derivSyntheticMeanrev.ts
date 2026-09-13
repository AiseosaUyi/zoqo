import type { Strategy } from "../core/strategy";

/** Mean-reversion on a Deriv synthetic volatility index
 *  (docs/alpha/02-market-landscape.md §4: "synthetic indices have known,
 *  published volatility characteristics"). Computes a z-score of the
 *  latest price against a trailing rolling window's mean/stddev and fades
 *  any move beyond `params.threshold` standard deviations, betting the
 *  price reverts toward the window mean — a legitimate, simple first-cut
 *  strategy for an instrument whose volatility process is publicly
 *  documented by the venue itself (unlike a real market, where an outsized
 *  move often carries information this kind of naive fade would trade
 *  against).
 *
 *  DATA-AVAILABILITY LIMITATION (documented, not silently papered over):
 *  this strategy reads its rolling window via
 *  `ctx.features.getPriceSeries(params.symbol)` — the same venue-agnostic,
 *  assetId-keyed feature path `terminalMaCross.ts` uses for `zoqo-terminal`
 *  assets. That path is backed by `price_history` rows keyed on `asset_id`
 *  (`features/priceFeatures.ts`); nothing in this program yet ingests
 *  Deriv tick data into that table for a symbol like "R_75" (no ingest job
 *  exists — `derivVirtual.ts`'s `getQuote` only fetches a single point
 *  on demand, it doesn't persist a series). Until a Deriv-specific ingest
 *  job is built, this strategy's `evaluate()` will honestly report "not
 *  enough price history" and emit no intents rather than fabricate a
 *  window from a single point. */

interface Params extends Record<string, unknown> {
  /** Deriv synthetic index symbol, e.g. "R_75" (Volatility 75 Index). */
  symbol: string;
  /** Number of trailing points the rolling mean/stddev is computed over
   *  (excludes the latest point being tested against them). */
  windowSize: number;
  /** Fade threshold, in standard deviations away from the rolling mean. */
  threshold: number;
  everyMin: number;
  stakePct: number;
}

const DEFAULT_PARAMS: Params = {
  symbol: "R_75",
  windowSize: 30,
  threshold: 2,
  everyMin: 15,
  stakePct: 0.05,
};

function mean(xs: number[]): number {
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

function stddev(xs: number[], m: number): number {
  const variance = xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

export const derivSyntheticMeanrev: Strategy = {
  key: "deriv-synthetic-meanrev",
  venues: ["deriv-virtual"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<Params>) };
    const series = ctx.features.getPriceSeries ? await ctx.features.getPriceSeries(params.symbol) : null;
    if (!series || series.length < params.windowSize + 1) {
      ctx.log("not enough price history for a rolling window yet", { have: series?.length ?? 0, need: params.windowSize + 1, symbol: params.symbol });
      return [];
    }

    const latest = series[series.length - 1].price;
    const window = series.slice(-params.windowSize - 1, -1).map((p) => p.price); // trailing window, excludes latest
    const m = mean(window);
    const sd = stddev(window, m);
    if (!(sd > 0)) {
      ctx.log("zero-variance window, can't compute a z-score", { symbol: params.symbol });
      return [];
    }

    const z = (latest - m) / sd;
    if (Math.abs(z) < params.threshold) {
      ctx.log("z-score below fade threshold", { z, threshold: params.threshold });
      return [];
    }

    // Mean reversion: bet AGAINST the direction of the deviation — a move
    // above the mean fades short (expecting it to fall back), and vice
    // versa.
    const side = z > 0 ? ("short" as const) : ("long" as const);
    const edge = Math.min(1, (Math.abs(z) - params.threshold) / params.threshold); // normalized excess z as a rough edge proxy

    return [
      {
        strategyId: "",
        market: { venue: "deriv-virtual", marketId: params.symbol },
        side,
        kind: "market",
        edge,
        suggestedStakePct: params.stakePct,
        rationale: `Deriv synthetic mean-reversion: z=${z.toFixed(2)} vs threshold ${params.threshold}, fading back toward the ${params.windowSize}-point rolling mean (${m.toFixed(2)})`,
        features: { z, mean: m, stddev: sd, latest },
      },
    ];
  },
};
