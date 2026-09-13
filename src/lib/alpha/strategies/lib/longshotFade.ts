import type { StrategyCtx } from "../../core/strategy";
import type { Intent } from "../../core/venue";

/** Favourite-longshot bias fade, factored out of `manifoldLongshotFade.ts`
 *  in Phase 4 when `polymarketSimLongshotFade.ts` became a second consumer
 *  of the exact same logic (docs/alpha/plans/phase-4-extra-venues.md's own
 *  DRY note — mirrors `strategies/lib/momentum.ts`'s factoring for
 *  `terminalHourlyMomentum`/`bybitHourlyMomentum`).
 *
 *  Behavioral-finance basis: bettors systematically overpay for longshots
 *  and underpay for near-certainties, so extreme prices on a
 *  probability-denominated market carry a real, well-documented edge in
 *  the direction of the FAVOURITE. Concretely: bet YES on anything priced
 *  above `params.highThreshold` (riding the already-favoured side, on the
 *  thesis that near-certainties are still slightly underpriced), and NO on
 *  anything priced below `params.lowThreshold` (symmetric fade of the
 *  longshot YES). This module is venue-agnostic — it only needs
 *  `ctx.venue.listMarkets`/`ctx.quotes`, which every probability-quoted
 *  venue (Manifold, Polymarket-sim) implements identically per
 *  `core/venue.ts`'s `VenueAdapter` interface. */

export interface LongshotFadeParams extends Record<string, unknown> {
  highThreshold: number;
  lowThreshold: number;
  everyMin: number;
  stakePct: number;
  searchTerm: string;
  candidateLimit: number;
}

export const LONGSHOT_FADE_DEFAULTS: LongshotFadeParams = {
  highThreshold: 0.95,
  lowThreshold: 0.05,
  everyMin: 60,
  stakePct: 0.03, // small — this strategy trades small-edge, high-probability outcomes
  searchTerm: "",
  candidateLimit: 20,
};

export async function evaluateLongshotFade(ctx: StrategyCtx, params: LongshotFadeParams): Promise<Intent[]> {
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
    // belief is systematically underpriced-for-NO (i.e. YES itself is the
    // correctly-favoured side but slightly cheap) — so bet YES to ride the
    // favourite; symmetric NO below lowThreshold.
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
}
