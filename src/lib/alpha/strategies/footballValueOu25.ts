import type { Strategy } from "../core/strategy";
import { parseMarketId } from "../venues/zoqoSportsbook";

/** `football-value-ou25` (docs/alpha/06-football-model.md §5): same value
 *  rule as `footballValue1x2.ts` (edge = p_model - p_book_implied_with_
 *  margin, min edge 2%, odds in [1.3, maxOdds]) applied to the over/under
 *  2.5 goals market instead of 1X2. See that file's header for the
 *  RAW-vs-margin-removed `marketProb` reasoning and the interval-vs-event
 *  schedule note — both apply identically here.
 *
 *  MODEL SOURCE: `football/models.ts`'s `blendModel` only blends the
 *  home/draw/away triple — its own doc comment says the O/U field "passes
 *  through unblended" from the Dixon-Coles side, since there's no market-
 *  implied O/U component in that function's inputs. So "the model" for
 *  this strategy is exactly the Dixon-Coles Poisson grid's `over25`
 *  probability (`fixtureFeatures.ts`'s `dc_prob_over25`) — not a blend —
 *  which is the pure math this program already has for this market. */

interface Params extends Record<string, unknown> {
  everyMin: number;
  minEdge: number;
  minOdds: number;
  maxOdds: number;
  candidateLimit: number;
  lookaheadHours: number;
}

const DEFAULT_PARAMS: Params = {
  everyMin: 60,
  minEdge: 0.02,
  minOdds: 1.3,
  maxOdds: 10,
  candidateLimit: 30,
  lookaheadHours: 6,
};

export const footballValueOu25: Strategy = {
  key: "football-value-ou25",
  venues: ["zoqo-sportsbook"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<Params>) };
    if (!ctx.features.getFixtureFeatures) {
      ctx.log("no fixture feature provider available");
      return [];
    }

    const candidates = await ctx.venue.listMarkets({ category: "ou25", limit: params.candidateLimit });
    if (candidates.length === 0) {
      ctx.log("no upcoming O/U 2.5 markets");
      return [];
    }

    const featuresByFixture = new Map<string, Record<string, number | string> | null>();
    const intents = [];

    for (const market of candidates) {
      const parsed = parseMarketId(market.marketId);
      if (!parsed || parsed.market !== "ou25") continue;

      if (!featuresByFixture.has(parsed.fixtureId)) {
        featuresByFixture.set(parsed.fixtureId, await ctx.features.getFixtureFeatures!(parsed.fixtureId));
      }
      const features = featuresByFixture.get(parsed.fixtureId);
      if (!features) continue;

      const kickoffAtMs = features.kickoff_at_ms;
      if (typeof kickoffAtMs === "number") {
        const hoursToKickoff = (kickoffAtMs - ctx.now) / 3_600_000;
        if (hoursToKickoff < 0 || hoursToKickoff > params.lookaheadHours) continue;
      }

      const over25 = features.dc_prob_over25;
      if (typeof over25 !== "number") continue; // no Dixon-Coles fit yet for this fixture's teams
      const modelProb = parsed.outcome === "over" ? over25 : parsed.outcome === "under" ? 1 - over25 : null;
      if (modelProb == null) continue;

      const quote = await ctx.quotes(market);
      if (!quote?.decimalOdds) continue;
      if (quote.decimalOdds < params.minOdds || quote.decimalOdds > params.maxOdds) continue;

      const rawImpliedProb = 1 / quote.decimalOdds;
      const edge = modelProb - rawImpliedProb;
      if (edge < params.minEdge) continue;

      intents.push({
        strategyId: "",
        market,
        side: "back" as const,
        kind: "market" as const,
        edge,
        modelProb,
        marketProb: rawImpliedProb,
        rationale: `Value O/U 2.5: Dixon-Coles ${parsed.outcome} ${(modelProb * 100).toFixed(1)}% vs ${quote.book ?? "book"} implied ${(rawImpliedProb * 100).toFixed(1)}% @ ${quote.decimalOdds.toFixed(2)} — edge ${(edge * 100).toFixed(1)}pt`,
        features: { modelProb, rawImpliedProb, decimalOdds: quote.decimalOdds },
      });
    }

    if (intents.length === 0) ctx.log("no value edges found", { checked: candidates.length });
    return intents;
  },
};
