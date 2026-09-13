import type { Strategy } from "../core/strategy";
import { evaluateLongshotFade, LONGSHOT_FADE_DEFAULTS, type LongshotFadeParams } from "./lib/longshotFade";

/** Favourite-longshot bias fade on Manifold (docs/alpha/03-architecture.md
 *  / behavioral-finance literature). The actual threshold-fade logic lives
 *  in `./lib/longshotFade.ts`, factored out in Phase 4 when
 *  `polymarketSimLongshotFade.ts` became a second consumer of the exact
 *  same shape (see that module's header) — this file now only wires
 *  Manifold's default params and schedule in. */

const DEFAULT_PARAMS: LongshotFadeParams = { ...LONGSHOT_FADE_DEFAULTS };

export const manifoldLongshotFade: Strategy = {
  key: "manifold-longshot-fade",
  venues: ["manifold"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<LongshotFadeParams>) };
    return evaluateLongshotFade(ctx, params);
  },
};
