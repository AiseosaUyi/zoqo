import type { Strategy } from "../core/strategy";

/** Fades big, fast moves on Manifold binary markets. A market whose
 *  probability jumped more than `params.threshold` inside the recent
 *  window, with meaningful time left before close, is treated as
 *  overreacting to news/betting pressure rather than settling on new
 *  information — bet the reversion direction (opposite the recent move).
 *  Uses `probChanges.day` off marketFeatures.ts (whatever Manifold's own
 *  payload actually reports, not a self-computed series — Phase 2 has no
 *  persisted Manifold price-history table the way priceFeatures.ts does
 *  for terminal assets). */

interface Params extends Record<string, unknown> {
  /** Absolute probability move over the recent window that counts as
   *  "overreacted" (e.g. 0.15 = a 15-point swing). */
  threshold: number;
  /** Skip markets closing sooner than this — a genuine mispricing needs
   *  room to revert before settlement forces it either way. */
  minTimeToCloseMs: number;
  everyMin: number;
  stakePct: number;
  searchTerm: string;
  candidateLimit: number;
}

const DEFAULT_PARAMS: Params = {
  threshold: 0.15,
  minTimeToCloseMs: 6 * 60 * 60 * 1000, // 6h
  everyMin: 45,
  stakePct: 0.05,
  searchTerm: "",
  candidateLimit: 20,
};

export const manifoldMeanReversion: Strategy = {
  key: "manifold-mean-reversion",
  venues: ["manifold"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<Params>) };
    const markets = await ctx.venue.listMarkets({ query: params.searchTerm || undefined, limit: params.candidateLimit });
    if (markets.length === 0) {
      ctx.log("no candidate markets returned", { searchTerm: params.searchTerm });
      return [];
    }

    for (const market of markets) {
      const features = ctx.features.getMarketFeatures ? await ctx.features.getMarketFeatures(market) : null;
      if (!features) continue;

      const midProb = Number(features.mid_prob);
      const momentum = Number(features.momentum);
      const timeToCloseMs = Number(features.time_to_close_ms);
      if (!Number.isFinite(midProb) || !Number.isFinite(momentum)) continue;
      if (Number.isFinite(timeToCloseMs) && timeToCloseMs < params.minTimeToCloseMs) continue;
      if (Math.abs(momentum) < params.threshold) continue;

      // Momentum > 0 means probability has been climbing recently — fade it
      // by betting NO (expecting reversion down); momentum < 0 fades to YES.
      const side = momentum > 0 ? ("no" as const) : ("yes" as const);
      const edge = Math.abs(momentum) - params.threshold; // how far past the trigger, not the full move

      return [
        {
          strategyId: "",
          market,
          side,
          kind: "market",
          edge,
          marketProb: midProb,
          suggestedStakePct: params.stakePct,
          rationale: `Mean reversion: probability moved ${(momentum * 100).toFixed(1)}pt recently (threshold ${(params.threshold * 100).toFixed(0)}pt), fading toward ${side.toUpperCase()} with ${(timeToCloseMs / 3_600_000).toFixed(1)}h left to close`,
          features: { midProb, momentum, timeToCloseMs },
        },
      ];
    }

    ctx.log("no market moved enough to fade", { threshold: params.threshold, checked: markets.length });
    return [];
  },
};
