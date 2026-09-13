import { mulberry32, pick } from "@/lib/math";
import type { Strategy } from "../core/strategy";

/** Noise baseline (docs/alpha/06-football-model.md §5's
 *  `football-market-only-control` plays the same role for football): places
 *  small, deterministic-but-arbitrary bets on Manifold with zero claimed
 *  edge, purely so the leaderboard can show whether `manifold-mean-
 *  reversion` and `manifold-longshot-fade` actually beat random chance
 *  rather than riding a lucky sample. "Deterministic-but-arbitrary" per
 *  CLAUDE.md's referrals.ts precedent: seeded off (userId, time bucket) via
 *  `mulberry32` (src/lib/math.ts) — never `Math.random()` — so re-running
 *  the same scheduled tick doesn't jitter to a different pick, but each new
 *  scheduled tick genuinely does pick something new.
 *
 *  Operational note: `alpha_strategies.min_edge` defaults to 0.02
 *  (service.ts), and this strategy honestly reports `edge: 0` — the risk
 *  gate's `below_min_edge` check will reject every intent from a
 *  control-strategy instance unless its `min_edge` is explicitly set to 0
 *  at creation time. That's intentional, not a bug: a control strategy that
 *  can silently inherit a nonzero min-edge is a control strategy someone
 *  will eventually mistake for a working one. */

interface Params extends Record<string, unknown> {
  everyMin: number;
  stakePct: number;
  searchTerm: string;
  candidateLimit: number;
}

const DEFAULT_PARAMS: Params = {
  everyMin: 60,
  stakePct: 0.02,
  searchTerm: "",
  candidateLimit: 10,
};

function seedFor(userId: string, now: number, bucketMs: number): number {
  const bucket = Math.floor(now / Math.max(1, bucketMs));
  const raw = `${userId}:${bucket}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  return hash >>> 0;
}

export const manifoldControl: Strategy = {
  key: "manifold-control",
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

    const rng = mulberry32(seedFor(ctx.userId, ctx.now, params.everyMin * 60_000));
    const market = pick(rng, markets);
    const side = rng() < 0.5 ? ("yes" as const) : ("no" as const);
    const quote = await ctx.quotes(market);

    return [
      {
        strategyId: "",
        market,
        side,
        kind: "market",
        // Honest zero — this is a noise baseline, not a signal. A non-zero
        // number here would misrepresent what this strategy is for.
        edge: 0,
        marketProb: quote?.impliedProb,
        suggestedStakePct: params.stakePct,
        rationale: "Control: deterministic seeded pick over candidate markets, no claimed edge — baseline for comparing the other strategies against chance",
        features: { seededPick: 1 },
      },
    ];
  },
};
