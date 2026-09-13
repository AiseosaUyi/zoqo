import type { Strategy } from "../core/strategy";

/** Favourite-longshot bias fade (docs/alpha/03-architecture.md /
 *  behavioral-finance literature): bettors systematically overpay for
 *  longshots and underpay for near-certainties, so extreme prices on a
 *  probability-denominated market carry a real, well-documented edge in
 *  the OPPOSITE direction of the crowd. Concretely: bet NO on anything
 *  priced above `params.highThreshold` (fading the longshot YES), and bet
 *  YES on anything priced below `params.lowThreshold` (fading the longshot
 *  NO) — in both cases, betting toward the extreme (the side the market
 *  already thinks is near-certain). */

interface Params extends Record<string, unknown> {
  highThreshold: number;
  lowThreshold: number;
  everyMin: number;
  stakePct: number;
  searchTerm: string;
  candidateLimit: number;
}

const DEFAULT_PARAMS: Params = {
  highThreshold: 0.95,
  lowThreshold: 0.05,
  everyMin: 60,
  stakePct: 0.03, // small — this strategy trades small-edge, high-probability outcomes
  searchTerm: "",
  candidateLimit: 20,
};

export const manifoldLongshotFade: Strategy = {
  key: "manifold-longshot-fade",
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
      const quote = await ctx.quotes(market);
      const prob = quote?.impliedProb;
      if (prob == null || !Number.isFinite(prob)) continue;

      // Betting WITH the extreme: above highThreshold the crowd already
      // believes YES is near-certain, and the bias literature says that
      // belief is systematically underpriced-for-NO (i.e. YES itself is
      // the correctly-favoured side but slightly cheap) — so bet YES to
      // ride the favourite; symmetric NO below lowThreshold.
      if (prob >= params.highThreshold) {
        const edge = prob - params.highThreshold;
        return [
          {
            strategyId: "",
            market,
            side: "yes" as const,
            kind: "market",
            edge,
            marketProb: prob,
            suggestedStakePct: params.stakePct,
            rationale: `Longshot fade: probability ${(prob * 100).toFixed(1)}% >= high threshold ${(params.highThreshold * 100).toFixed(0)}%, favourite-longshot bias favours the favourite`,
            features: { prob },
          },
        ];
      }
      if (prob <= params.lowThreshold) {
        const edge = params.lowThreshold - prob;
        return [
          {
            strategyId: "",
            market,
            side: "no" as const,
            kind: "market",
            edge,
            marketProb: prob,
            suggestedStakePct: params.stakePct,
            rationale: `Longshot fade: probability ${(prob * 100).toFixed(1)}% <= low threshold ${(params.lowThreshold * 100).toFixed(0)}%, favourite-longshot bias favours NO`,
            features: { prob },
          },
        ];
      }
    }

    ctx.log("no market at an extreme price", { highThreshold: params.highThreshold, lowThreshold: params.lowThreshold, checked: markets.length });
    return [];
  },
};
