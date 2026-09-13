/** The four Phase-1-scope football prediction models
 *  (docs/alpha/06-football-model.md §3, models 1-4; model 5 `ml` is
 *  Python/Phase 6 and out of scope here) — pure math, no I/O.
 *
 *  This is deliberately a single dispatcher module, not four separate
 *  files: every model here is a thin composition of `margin.ts` (market),
 *  `dixonColes.ts` (dixon-coles), or `elo.ts` (elo), or a linear
 *  combination of two of the above (blend). None of them owns fitting —
 *  `dixon-coles`/`blend` take an already-fitted `DixonColesFit` grid input
 *  (via `expectedGoals`/`poissonGrid` from `dixonColes.ts`) and `elo` takes
 *  an already-computed ELO rating pair; the caller (the ingest/backtest
 *  pipeline a later phase builds) owns running `fitDixonColes`/`updateElo`
 *  over history and persisting the results. */

import { removeMargin, type MarginMethod } from "./margin";
import { eloTo1X2 } from "./elo";
import {
  expectedGoals,
  poissonGrid,
  gridTo1X2,
  gridToOverUnder,
  gridToBtts,
  type DixonColesFit,
} from "./dixonColes";

export type FootballModelKey = "market" | "dixon-coles" | "elo" | "blend";

export interface FootballPrediction {
  home: number;
  draw: number;
  away: number;
  over25?: number;
  btts?: number;
}

/** Default blend weight on the market probability, per
 *  docs/alpha/06-football-model.md §3 item 4: "expect w around 0.7 to
 *  0.85"; 0.75 is the spec's own suggested starting point. Fitting `w` per
 *  league by minimizing RPS on a walk-forward holdout is a backtest-time
 *  nice-to-have (docs/alpha/06-football-model.md §3), not something this
 *  module does — it just exposes `w` as a parameter with this sane
 *  default. */
export const DEFAULT_BLEND_WEIGHT = 0.75;

/** One book's decimal odds for a 1X2 market, keyed by outcome. Multiple
 *  books get averaged (after margin removal, per
 *  docs/alpha/06-football-model.md §2's "consensus = mean across books")
 *  by `marketModel`. */
export interface OneXTwoOdds {
  home: number;
  draw: number;
  away: number;
}

/** `market` model: consensus implied probability across one or more books'
 *  1X2 odds, margin removed per-book before averaging (removing margin
 *  after averaging would double-count books with different overrounds).
 *  `method` defaults to multiplicative normalization per
 *  docs/alpha/06-football-model.md §2's stated default; Shin's method is
 *  available via the same `MarginMethod` used elsewhere in this program
 *  (see `margin.ts`). */
export function marketModel(booksOdds: OneXTwoOdds[], method: MarginMethod = "multiplicative"): FootballPrediction {
  if (booksOdds.length === 0) throw new Error("marketModel requires at least one book's odds");
  const perBook = booksOdds.map((o) => removeMargin([o.home, o.draw, o.away], method));
  const n = perBook.length;
  const home = perBook.reduce((s, p) => s + p[0], 0) / n;
  const draw = perBook.reduce((s, p) => s + p[1], 0) / n;
  const away = perBook.reduce((s, p) => s + p[2], 0) / n;
  return { home, draw, away };
}

/** `dixon-coles` model: probabilities read off a fitted Poisson grid for
 *  this specific fixture. `overUnderLine` defaults to 2.5, the market's
 *  standard "over/under 2.5 goals" line
 *  (docs/alpha/06-football-model.md §2). `maxGoals` is passed straight
 *  through to `poissonGrid`. */
export function dixonColesModel(
  fit: DixonColesFit,
  homeTeamId: string,
  awayTeamId: string,
  overUnderLine: number = 2.5,
  maxGoals?: number,
): FootballPrediction {
  const { homeExpected, awayExpected } = expectedGoals(fit, homeTeamId, awayTeamId);
  const grid = poissonGrid(homeExpected, awayExpected, fit.rho, maxGoals);
  const { home, draw, away } = gridTo1X2(grid);
  const { over } = gridToOverUnder(grid, overUnderLine);
  const { yes } = gridToBtts(grid);
  return { home, draw, away, over25: over, btts: yes };
}

/** `elo` model: 1X2 split purely from the ELO rating gap, via
 *  `eloTo1X2` (see elo.ts for the exact home-advantage-plus-draw-band
 *  formula and its honestly-documented approximation). `eloDiff` should
 *  already include home advantage if the caller wants it applied (this
 *  function doesn't add it itself, since some callers may want a
 *  neutral-venue comparison — e.g. `updateElo`'s effective-rating
 *  convention is the caller's to apply). */
export function eloModel(eloDiff: number, drawConstant?: number): FootballPrediction {
  return eloTo1X2(eloDiff, drawConstant);
}

/** `blend` model: `p = w * market + (1 - w) * dixon-coles`, applied
 *  component-wise to home/draw/away (and, when both sides provide it,
 *  over25/btts too — otherwise the dixon-coles-only field passes through
 *  unblended, since the market side has no O/U or BTTS opinion here).
 *  `w` defaults to `DEFAULT_BLEND_WEIGHT`. This is the default model for
 *  betting per docs/alpha/06-football-model.md §3 item 4. */
export function blendModel(market: FootballPrediction, dixonColes: FootballPrediction, w: number = DEFAULT_BLEND_WEIGHT): FootballPrediction {
  const clampedW = Math.min(1, Math.max(0, w));
  const blend = (a: number, b: number) => clampedW * a + (1 - clampedW) * b;
  const result: FootballPrediction = {
    home: blend(market.home, dixonColes.home),
    draw: blend(market.draw, dixonColes.draw),
    away: blend(market.away, dixonColes.away),
  };
  if (dixonColes.over25 != null) result.over25 = dixonColes.over25;
  if (dixonColes.btts != null) result.btts = dixonColes.btts;
  return result;
}
