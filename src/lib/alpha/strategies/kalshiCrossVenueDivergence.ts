import type { Strategy } from "../core/strategy";
import { getVenueSecret } from "../secrets";
import { fetchKalshiMarketsWithTitles } from "../venues/kalshiDemo";
import { bestMatch, fetchManifoldCandidates, normalizeQuestion, upsertMarketLink, MATCH_THRESHOLD } from "../marketMatching";

/** Cross-venue divergence, Kalshi vs Manifold (docs/alpha/03-architecture.md
 *  §4's `alpha_market_links`, docs/alpha/plans/phase-4-extra-venues.md).
 *  For each open Kalshi market, finds the best-matching open Manifold
 *  market by question-text token overlap (`marketMatching.ts` — explicitly
 *  a first-cut heuristic matcher, not entity resolution, see that file's
 *  header), records the pairing as an unconfirmed `alpha_market_links` row
 *  per matched market, and — when a confident match exists and the two
 *  venues' implied probabilities on it diverge meaningfully — bets Kalshi
 *  in the direction Manifold's consensus suggests it's mispriced.
 *
 *  Direction: if Kalshi's implied YES probability is LOWER than Manifold's
 *  on the same question, Kalshi's YES looks cheap relative to the other
 *  venue's consensus, so this bets `yes`; if Kalshi's implied prob is
 *  HIGHER, it bets `no`. This is a pure "does the other venue disagree with
 *  this venue" signal — it does not know which venue (if either) is
 *  "right", only that a persistent gap between two independent markets on
 *  the same real-world question is itself a tradeable edge signal, which is
 *  the whole premise of `alpha_market_links` per 03-architecture.md §4. */

interface Params extends Record<string, unknown> {
  /** Minimum absolute probability gap between the two venues to act on. */
  divergenceThreshold: number;
  /** How many open Kalshi markets to check per run. */
  kalshiCandidateLimit: number;
  /** How many open Manifold markets to consider as match candidates. */
  manifoldCandidateLimit: number;
  everyMin: number;
  stakePct: number;
}

const DEFAULT_PARAMS: Params = {
  divergenceThreshold: 0.1,
  kalshiCandidateLimit: 15,
  manifoldCandidateLimit: 150,
  everyMin: 60,
  stakePct: 0.05,
};

export const kalshiCrossVenueDivergence: Strategy = {
  key: "kalshi-cross-venue-divergence",
  venues: ["kalshi-demo"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<Params>) };

    // Kalshi's own VenueAdapter.listMarkets() returns bare MarketRefs (no
    // question text, per core/venue.ts) — this strategy needs titles for
    // matching, so it reads them directly off kalshiDemo.ts's raw export
    // rather than through ctx.venue. That means resolving the credential
    // itself, same lazy-lookup shape kalshiDemo.ts's own adapter factory
    // uses internally.
    const rawSecret = await getVenueSecret(ctx.userId, "kalshi-demo");
    const kalshiMarkets = await fetchKalshiMarketsWithTitles(rawSecret, params.kalshiCandidateLimit);
    if (kalshiMarkets.length === 0) {
      ctx.log("no open Kalshi markets with titles available (missing credential or empty listing)");
      return [];
    }

    const manifoldCandidates = await fetchManifoldCandidates(params.manifoldCandidateLimit);
    if (manifoldCandidates.length === 0) {
      ctx.log("no Manifold candidates available to match against");
      return [];
    }

    const intents = [];
    for (const kalshiMarket of kalshiMarkets) {
      const match = bestMatch(kalshiMarket.title, manifoldCandidates);
      if (!match || match.score < MATCH_THRESHOLD) continue;

      const canonical = normalizeQuestion(kalshiMarket.title);
      // Record the pairing either way once it clears the match threshold —
      // confirmed=false always (see marketMatching.ts header); this is the
      // matching job's persistence step, independent of whether a
      // divergence trade fires this run.
      await upsertMarketLink(canonical, "kalshi-demo", kalshiMarket.marketId);
      await upsertMarketLink(canonical, "manifold", match.candidate.marketId);

      const quote = await ctx.quotes({ venue: "kalshi-demo", marketId: kalshiMarket.marketId });
      const kalshiProb = quote?.impliedProb;
      const manifoldProb = (match.candidate as { probability?: number }).probability;
      if (typeof kalshiProb !== "number" || typeof manifoldProb !== "number") continue;

      const divergence = manifoldProb - kalshiProb;
      if (Math.abs(divergence) < params.divergenceThreshold) continue;

      const side = divergence > 0 ? ("yes" as const) : ("no" as const);
      intents.push({
        strategyId: "",
        market: { venue: "kalshi-demo" as const, marketId: kalshiMarket.marketId },
        side,
        kind: "market" as const,
        edge: Math.abs(divergence),
        modelProb: manifoldProb,
        marketProb: kalshiProb,
        suggestedStakePct: params.stakePct,
        rationale: `Cross-venue divergence: Kalshi "${kalshiMarket.title}" implies ${(kalshiProb * 100).toFixed(1)}%, matched Manifold question implies ${(manifoldProb * 100).toFixed(1)}% (match score ${match.score.toFixed(2)}) — betting ${side.toUpperCase()} on Kalshi`,
        features: { kalshiProb, manifoldProb, matchScore: match.score, divergence },
      });
    }

    if (intents.length === 0) ctx.log("no confidently-matched market diverged past threshold", { checked: kalshiMarkets.length, threshold: params.divergenceThreshold });
    return intents;
  },
};
