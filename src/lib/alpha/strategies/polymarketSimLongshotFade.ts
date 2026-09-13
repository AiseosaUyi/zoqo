import type { Strategy } from "../core/strategy";
import { evaluateLongshotFade, LONGSHOT_FADE_DEFAULTS, type LongshotFadeParams } from "./lib/longshotFade";

/** Favourite-longshot bias fade on `polymarket-sim` — the identical logic
 *  to `manifoldLongshotFade.ts`, applied to a second probability-quoted
 *  venue (docs/alpha/plans/phase-4-extra-venues.md: "same favourite-
 *  longshot fade logic ... applied to polymarket-sim instead"). The shared
 *  threshold-fade math lives in `./lib/longshotFade.ts`; this file only
 *  wires `polymarket-sim`'s default params and schedule in.
 *
 *  `polymarketSim.ts`'s `place()` walks the real CLOB order book to
 *  simulate a fill (never a real order), so this strategy's `evaluate()`
 *  is unaware of and unaffected by that simulation — it only ever reads
 *  `ctx.quotes(market).impliedProb`, the same shape every venue's Quote
 *  carries. */

const DEFAULT_PARAMS: LongshotFadeParams = { ...LONGSHOT_FADE_DEFAULTS, candidateLimit: 30 };

export const polymarketSimLongshotFade: Strategy = {
  key: "polymarket-sim-longshot-fade",
  venues: ["polymarket-sim"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<LongshotFadeParams>) };
    return evaluateLongshotFade(ctx, params);
  },
};
