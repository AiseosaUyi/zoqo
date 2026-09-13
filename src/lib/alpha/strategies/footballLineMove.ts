import type { Strategy } from "../core/strategy";
import { parseMarketId } from "../venues/zoqoSportsbook";

/** `football-line-move` (docs/alpha/06-football-model.md §5): bets when the
 *  24h consensus line has moved at least `params.moveThreshold` toward an
 *  outcome AND the model (Dixon-Coles, when a fit is available — otherwise
 *  the market itself, which trivially "agrees" with the market) also
 *  favors that outcome more than the CURRENT consensus does — "sharp line
 *  movement... when the model agrees" (doc's own phrase). Momentum in odds
 *  is a documented CLV source per docs/alpha/02-market-landscape.md §6.
 *
 *  `line_move_<outcome>_24h` (from `fixtureFeatures.ts`) is
 *  `currentConsensus - consensus24hAgo` for that outcome — positive means
 *  the market has been moving probability TOWARD that outcome over the
 *  last day. "The model agrees" is checked as `modelProb(outcome) >
 *  currentConsensus(outcome)`: the model itself, independent of the move,
 *  still thinks that outcome deserves more probability than the market
 *  currently gives it — i.e. the model hasn't already fully priced in the
 *  move (or has moved further in the same direction). */

interface Params extends Record<string, unknown> {
  everyMin: number;
  moveThreshold: number;
  minEdge: number;
  minOdds: number;
  maxOdds: number;
  candidateLimit: number;
  lookaheadHours: number;
}

const DEFAULT_PARAMS: Params = {
  everyMin: 60,
  moveThreshold: 0.03,
  minEdge: 0.02,
  minOdds: 1.3,
  maxOdds: 10,
  candidateLimit: 30,
  lookaheadHours: 24,
};

const OUTCOMES = ["home", "draw", "away"] as const;

export const footballLineMove: Strategy = {
  key: "football-line-move",
  venues: ["zoqo-sportsbook"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<Params>) };
    if (!ctx.features.getFixtureFeatures) {
      ctx.log("no fixture feature provider available");
      return [];
    }

    const candidates = await ctx.venue.listMarkets({ category: "1x2", limit: params.candidateLimit });
    if (candidates.length === 0) {
      ctx.log("no upcoming 1x2 markets");
      return [];
    }

    const featuresByFixture = new Map<string, Record<string, number | string> | null>();
    const intents = [];
    const seenFixtures = new Set<string>();

    for (const market of candidates) {
      const parsed = parseMarketId(market.marketId);
      if (!parsed || parsed.market !== "1x2") continue;
      if (seenFixtures.has(parsed.fixtureId)) continue; // one call per fixture below covers all 3 outcomes at once

      if (!featuresByFixture.has(parsed.fixtureId)) {
        featuresByFixture.set(parsed.fixtureId, await ctx.features.getFixtureFeatures!(parsed.fixtureId));
      }
      const features = featuresByFixture.get(parsed.fixtureId);
      if (!features) continue;
      seenFixtures.add(parsed.fixtureId);

      const kickoffAtMs = features.kickoff_at_ms;
      if (typeof kickoffAtMs === "number") {
        const hoursToKickoff = (kickoffAtMs - ctx.now) / 3_600_000;
        if (hoursToKickoff < 0 || hoursToKickoff > params.lookaheadHours) continue;
      }

      for (const outcome of OUTCOMES) {
        const move = features[`line_move_${outcome}_24h`];
        const currentConsensus = features[`consensus_${outcome}_multiplicative`];
        if (typeof move !== "number" || typeof currentConsensus !== "number") continue;
        if (move < params.moveThreshold) continue;

        // "The model agrees": prefer the Dixon-Coles read when a fit
        // exists, otherwise the move has nothing independent to confirm it
        // against (falls through, no bet — a market-only echo of its own
        // movement isn't the signal this strategy is looking for).
        const dcProb = features[`dc_prob_${outcome}`];
        if (typeof dcProb !== "number") continue;
        if (dcProb <= currentConsensus) continue;

        const marketRef = { venue: "zoqo-sportsbook" as const, marketId: `${parsed.fixtureId}:1x2:${outcome}` };
        const quote = await ctx.quotes(marketRef);
        if (!quote?.decimalOdds) continue;
        if (quote.decimalOdds < params.minOdds || quote.decimalOdds > params.maxOdds) continue;

        const rawImpliedProb = 1 / quote.decimalOdds;
        const edge = dcProb - rawImpliedProb;
        if (edge < params.minEdge) continue;

        intents.push({
          strategyId: "",
          market: marketRef,
          side: "back" as const,
          kind: "market" as const,
          edge,
          modelProb: dcProb,
          marketProb: rawImpliedProb,
          rationale: `Line move: consensus ${outcome} moved +${(move * 100).toFixed(1)}pt in 24h (>= ${(params.moveThreshold * 100).toFixed(0)}pt), Dixon-Coles agrees at ${(dcProb * 100).toFixed(1)}% vs ${quote.book ?? "book"} implied ${(rawImpliedProb * 100).toFixed(1)}%`,
          features: { move, currentConsensus, dcProb, decimalOdds: quote.decimalOdds },
        });
      }
    }

    if (intents.length === 0) ctx.log("no confirmed line moves found", { checked: seenFixtures.size });
    return intents;
  },
};
