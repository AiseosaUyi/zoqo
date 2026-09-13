import { mulberry32, pick } from "@/lib/math";
import type { Strategy } from "../core/strategy";
import { parseMarketId } from "../venues/zoqoSportsbook";

/** `football-market-only-control` (docs/alpha/06-football-model.md §5):
 *  "places no bets; records what the pure market would have done... A
 *  control strategy that shows zero edge is how the page proves the others
 *  are not luck." Same mechanism as `manifoldControl.ts`'s control
 *  strategy: an honest `edge: 0` on every intent, which `risk.ts`'s
 *  `below_min_edge` check naturally rejects (`alpha_strategies.min_edge`
 *  defaults to 0.02) — the intent is logged to `alpha_decisions` as a
 *  rejection either way, which is exactly the "recorded, never wagered"
 *  behavior this strategy exists for. No bet is ever placed by this
 *  strategy, deliberately.
 *
 *  Picks a deterministic-but-arbitrary upcoming 1X2 fixture/outcome, seeded
 *  off `(userId, time bucket)` via `mulberry32` — never `Math.random()`,
 *  same precedent as `manifoldControl.ts`/`referrals.ts` — so re-running
 *  the same scheduled tick doesn't jitter, but each new tick picks
 *  something fresh. `modelProb`/`marketProb` are both set to the market's
 *  own raw implied probability (there is no separate "model" opinion here
 *  by design — this strategy IS the market, recorded for comparison). */

interface Params extends Record<string, unknown> {
  everyMin: number;
  candidateLimit: number;
}

const DEFAULT_PARAMS: Params = {
  everyMin: 60,
  candidateLimit: 20,
};

function seedFor(userId: string, now: number, bucketMs: number): number {
  const bucket = Math.floor(now / Math.max(1, bucketMs));
  const raw = `${userId}:${bucket}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  return hash >>> 0;
}

export const footballMarketOnlyControl: Strategy = {
  key: "football-market-only-control",
  venues: ["zoqo-sportsbook"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<Params>) };
    const candidates = await ctx.venue.listMarkets({ category: "1x2", limit: params.candidateLimit });
    if (candidates.length === 0) {
      ctx.log("no upcoming 1x2 markets");
      return [];
    }

    const rng = mulberry32(seedFor(ctx.userId, ctx.now, params.everyMin * 60_000));
    const market = pick(rng, candidates);
    const parsed = parseMarketId(market.marketId);
    const quote = await ctx.quotes(market);
    const marketProb = quote?.impliedProb;

    return [
      {
        strategyId: "",
        market,
        side: "back" as const,
        kind: "market" as const,
        // Honest zero — this is a control baseline, not a signal (see
        // module header).
        edge: 0,
        modelProb: marketProb,
        marketProb,
        rationale: `Control: deterministic seeded pick over candidate 1X2 markets (${parsed ? `${parsed.fixtureId}/${parsed.outcome}` : market.marketId}), no claimed edge — records what the market alone would predict, never wagers`,
        features: { seededPick: 1 },
      },
    ];
  },
};
