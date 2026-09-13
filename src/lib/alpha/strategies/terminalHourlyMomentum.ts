import type { Strategy } from "../core/strategy";

/** The user's literal example from docs/alpha/03-architecture.md's build
 *  prompt: "trade every hour." Every 60 minutes (default), goes long or
 *  short by the sign of the trailing 4h return, with an ATR-derived stop —
 *  no take-profit (momentum strategies are typically stopped out or ridden,
 *  not target-exited). Deliberately simple: this is the proof-of-loop
 *  strategy, not the one expected to carry the leaderboard. */

interface Params extends Record<string, unknown> {
  assetId: string;
  everyMin: number;
  atrMultiple: number;
  stakePct: number;
  /** Below this absolute 4h return, treat it as noise and skip. */
  minReturnAbs: number;
}

const DEFAULT_PARAMS: Params = {
  assetId: "BTC",
  everyMin: 60,
  atrMultiple: 2,
  stakePct: 0.1,
  minReturnAbs: 0.002,
};

export const terminalHourlyMomentum: Strategy = {
  key: "terminal-hourly-momentum",
  venues: ["zoqo-terminal"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<Params>) };
    const features = ctx.features.getPriceFeatures ? await ctx.features.getPriceFeatures(params.assetId) : null;
    if (!features) {
      ctx.log("no price features available", { assetId: params.assetId });
      return [];
    }

    const price = Number(features.price);
    const atr = Number(features.atr);
    const return4h = Number(features.return_4h);
    if (!Number.isFinite(price) || !Number.isFinite(return4h) || price <= 0) return [];
    if (Math.abs(return4h) < params.minReturnAbs) {
      ctx.log("4h return below noise threshold", { return4h, minReturnAbs: params.minReturnAbs });
      return [];
    }

    const side = return4h > 0 ? ("long" as const) : ("short" as const);
    const stopDistance = Number.isFinite(atr) && atr > 0 ? atr * params.atrMultiple : price * 0.02;
    const stopLoss = side === "long" ? price - stopDistance : price + stopDistance;

    return [
      {
        strategyId: "",
        market: { venue: "zoqo-terminal", marketId: params.assetId },
        side,
        kind: "market",
        edge: Math.abs(return4h),
        suggestedStakePct: params.stakePct,
        stopLoss,
        rationale: `Hourly momentum: 4h return ${(return4h * 100).toFixed(2)}%, ATR stop at ${stopLoss.toFixed(2)}`,
        features: { price, atr, return4h },
      },
    ];
  },
};
