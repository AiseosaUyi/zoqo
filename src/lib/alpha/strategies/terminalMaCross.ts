import type { Strategy } from "../core/strategy";

/** Port of the existing `ma-cross` automation condition
 *  (src/app/api/cron/evaluate-triggers/route.ts) as an Alpha strategy —
 *  same crossing-detection algorithm (compare the current N-point window to
 *  the window one point back; fire on a sign change), now schedule-driven
 *  and routed through the risk gate instead of the automations' own
 *  max_order_size/daily_cap checks. */

interface Params extends Record<string, unknown> {
  assetId: string;
  fastMin: number;
  slowMin: number;
  everyMin: number;
  /** Fraction of strategy budget suggested before the risk gate sizes it. */
  stakePct: number;
}

const DEFAULT_PARAMS: Params = { assetId: "BTC", fastMin: 5, slowMin: 20, everyMin: 5, stakePct: 0.1 };

function average(points: { price: number }[]): number {
  return points.reduce((sum, p) => sum + p.price, 0) / points.length;
}

export const terminalMaCross: Strategy = {
  key: "terminal-ma-cross",
  venues: ["zoqo-terminal"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<Params>) };
    const series = ctx.features.getPriceSeries ? await ctx.features.getPriceSeries(params.assetId) : null;
    if (!series) {
      ctx.log("no price series available", { assetId: params.assetId });
      return [];
    }

    const need = params.slowMin;
    if (series.length < need + 1) {
      ctx.log("slow MA window not filled yet", { have: series.length, need: need + 1 });
      return [];
    }

    const nowWindow = series.slice(-need);
    const prevWindow = series.slice(-need - 1, -1);
    const fastNow = average(nowWindow.slice(-params.fastMin));
    const slowNow = average(nowWindow);
    const fastPrev = average(prevWindow.slice(-params.fastMin));
    const slowPrev = average(prevWindow);
    const fired = Math.sign(fastPrev - slowPrev) !== Math.sign(fastNow - slowNow) && fastNow !== slowNow;
    if (!fired) return [];

    const side = fastNow > slowNow ? ("long" as const) : ("short" as const);
    const edge = Math.abs(fastNow - slowNow) / slowNow;

    return [
      {
        strategyId: "", // filled in by runner.ts from the alpha_strategies row id
        market: { venue: "zoqo-terminal", marketId: params.assetId },
        side,
        kind: "market",
        edge,
        suggestedStakePct: params.stakePct,
        rationale: `MA cross: fast(${params.fastMin})=${fastNow.toFixed(2)} vs slow(${params.slowMin})=${slowNow.toFixed(2)}, was ${fastPrev > slowPrev ? "above" : "below"}`,
        features: { fastNow, slowNow, fastPrev, slowPrev },
      },
    ];
  },
};
