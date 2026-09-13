import type { Strategy } from "../core/strategy";
import { parseMarketId } from "../venues/zoqoSportsbook";
import { blendModel, type FootballPrediction } from "../football/models";

/** `football-value-1x2` (docs/alpha/06-football-model.md §5): backs an
 *  outcome when the blend model's probability beats the taken book's own
 *  RAW (margin-inclusive) implied probability by at least `params.minEdge`
 *  — the doc's own betting rule, "edge = p_model - p_book_implied_with_
 *  margin", read literally as the book's raw price (1/decimalOdds), not a
 *  margin-removed one: a bettor's real edge has to clear the book's actual
 *  price, margin included, not just the fair line underneath it.
 *
 *  `marketProb` is set to that same raw implied probability rather than the
 *  cross-book margin-removed consensus `fixtureFeatures.ts` also computes,
 *  because `runner.ts` (unmodified, out of this task's scope) derives the
 *  odds it hands the risk gate's Kelly sizing as `1 / intent.marketProb` —
 *  that has to invert back to the REAL decimal odds taken, or Kelly sizes
 *  against a fictitious (fairer) price than the venue actually offers.
 *
 *  SCHEDULE NOTE: the doc specifies an event schedule ("runs T-6h and T-1h
 *  per fixture"). `core/strategy.ts`'s `StrategySchedule` union already has
 *  an `{kind:"event", on:"fixture-T-minus-60"}` shape, but `runner.ts`'s
 *  `computeNextRunAt` (unmodified — out of scope) only implements
 *  `interval` schedules today; an event-scheduled strategy would never
 *  actually run. This strategy uses `interval` instead and relies on its
 *  own `lookaheadHours`/kickoff-time check inside `evaluate()` to
 *  approximate "only act on fixtures inside the pre-kickoff window" —
 *  a documented scope cut, not a silent gap. */

interface Params extends Record<string, unknown> {
  everyMin: number;
  minEdge: number;
  minOdds: number;
  maxOdds: number;
  candidateLimit: number;
  /** Only consider fixtures within this many hours of kickoff (and not yet
   *  kicked off) — the interval-schedule stand-in for the doc's T-6h/T-1h
   *  event triggers, see header. */
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

function marketPredictionFromFeatures(features: Record<string, number | string>): FootballPrediction | null {
  const home = features.consensus_home_multiplicative;
  const draw = features.consensus_draw_multiplicative;
  const away = features.consensus_away_multiplicative;
  if (typeof home !== "number" || typeof draw !== "number" || typeof away !== "number") return null;
  return { home, draw, away };
}

function dixonColesPredictionFromFeatures(features: Record<string, number | string>): FootballPrediction | null {
  const home = features.dc_prob_home;
  const draw = features.dc_prob_draw;
  const away = features.dc_prob_away;
  if (typeof home !== "number" || typeof draw !== "number" || typeof away !== "number") return null;
  const over25 = typeof features.dc_prob_over25 === "number" ? features.dc_prob_over25 : undefined;
  const btts = typeof features.dc_prob_btts_yes === "number" ? features.dc_prob_btts_yes : undefined;
  return { home, draw, away, over25, btts };
}

function pick1x2(prediction: FootballPrediction, outcome: "home" | "draw" | "away"): number {
  return outcome === "home" ? prediction.home : outcome === "draw" ? prediction.draw : prediction.away;
}

export const footballValue1x2: Strategy = {
  key: "football-value-1x2",
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

    for (const market of candidates) {
      const parsed = parseMarketId(market.marketId);
      if (!parsed || parsed.market !== "1x2") continue;
      const outcome = parsed.outcome as "home" | "draw" | "away";

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

      const marketPrediction = marketPredictionFromFeatures(features);
      if (!marketPrediction) continue; // no real book line to beat yet
      const dcPrediction = dixonColesPredictionFromFeatures(features);
      const blended = dcPrediction ? blendModel(marketPrediction, dcPrediction) : marketPrediction;
      const modelProb = pick1x2(blended, outcome);

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
        rationale: `Value 1X2: blend model ${(modelProb * 100).toFixed(1)}% vs ${quote.book ?? "book"} implied ${(rawImpliedProb * 100).toFixed(1)}% @ ${quote.decimalOdds.toFixed(2)} — edge ${(edge * 100).toFixed(1)}pt`,
        features: { modelProb, rawImpliedProb, decimalOdds: quote.decimalOdds },
      });
    }

    if (intents.length === 0) ctx.log("no value edges found", { checked: candidates.length });
    return intents;
  },
};
