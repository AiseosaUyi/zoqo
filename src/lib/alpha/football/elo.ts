/** ELO ratings for football teams — pure math, no I/O.
 *
 *  Parameters per docs/alpha/06-football-model.md §1 item 5: K=20, a fixed
 *  home-advantage bonus of +60 ELO points added to the home team's rating
 *  before computing its expected score, and a goal-difference multiplier
 *  "as ClubElo does". `updateElo` implements exactly that update rule;
 *  `expectedScore` is the standard logistic ELO expectation (base 10,
 *  divisor 400, as used by FIDE chess ELO and ported by essentially every
 *  sports ELO variant including ClubElo: http://clubelo.com/System);
 *  `eloTo1X2` turns a raw ELO gap into a three-way (home/draw/away)
 *  probability split, which plain ELO does not natively provide (see its
 *  doc comment below for the exact approximation and why).
 */

import type { OneXTwoProbabilities } from "./types";

/** Standard ELO expected-score formula: the probability-like "expected
 *  fraction of a win" for the side rated `ratingA` against `ratingB`
 *  (1 = certain win, 0 = certain loss, 0.5 = evenly matched). Base 10,
 *  divisor 400 is the universal ELO convention. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export const DEFAULT_K = 20;
export const DEFAULT_HOME_ADVANTAGE = 60;

/** Goal-difference multiplier used by ClubElo to make bigger wins move
 *  ratings more than 1-0 squeakers. ClubElo's own published formula
 *  (http://clubelo.com/System) is approximately:
 *    multiplier = ln(|goalDiff| + 1) * (2.2 / (|goalDiff|*0.001 + eloDiffOfWinner*0.001 + 2.2))
 *  where `eloDiffOfWinner` is the pre-match rating gap in favor of the
 *  match winner (so an underdog winning big moves ratings even more).
 *  We implement that shape here — this is a good-faith reproduction of the
 *  publicly documented formula, not a verified byte-for-byte port (ClubElo
 *  doesn't publish source code, only the formula), and is honestly labeled
 *  as such. Draws (`goalDiff === 0`) are handled as multiplier = 1: the
 *  ln(0+1) = 0 term would otherwise zero out every draw's rating update,
 *  which is wrong — a draw should still move ratings toward the surprise
 *  implied by actual (0.5) vs expected score, just without a blowout
 *  bonus. */
export function goalDifferenceMultiplier(goalDiff: number, winnerEloDiff: number): number {
  const absGoalDiff = Math.abs(goalDiff);
  if (absGoalDiff === 0) return 1;
  const absWinnerEloDiff = Math.abs(winnerEloDiff);
  return (
    Math.log(absGoalDiff + 1) *
    (2.2 / (absGoalDiff * 0.001 + absWinnerEloDiff * 0.001 + 2.2))
  );
}

export interface UpdateEloInput {
  homeElo: number;
  awayElo: number;
  homeGoals: number;
  awayGoals: number;
  k?: number;
  homeAdvantage?: number;
}

export interface UpdateEloResult {
  newHomeElo: number;
  newAwayElo: number;
}

/** Updates both teams' ELO from one full-time result. Home advantage is
 *  applied only to the *effective* rating used for the expectation, not
 *  stored back — the persisted rating stays a "neutral-venue" strength
 *  number, per the standard ELO-with-home-advantage convention (ClubElo
 *  does the same: the +100 home bump it uses internally never becomes part
 *  of the permanent rating). */
export function updateElo(input: UpdateEloInput): UpdateEloResult {
  const { homeElo, awayElo, homeGoals, awayGoals, k = DEFAULT_K, homeAdvantage = DEFAULT_HOME_ADVANTAGE } = input;

  const effectiveHomeElo = homeElo + homeAdvantage;
  const expectedHome = expectedScore(effectiveHomeElo, awayElo);
  const expectedAway = 1 - expectedHome;

  const goalDiff = homeGoals - awayGoals;
  const actualHome = goalDiff > 0 ? 1 : goalDiff < 0 ? 0 : 0.5;
  const actualAway = 1 - actualHome;

  // winnerEloDiff: the pre-match effective rating gap in favor of whoever
  // actually won (0 for a draw, where the multiplier is 1 anyway).
  const winnerEloDiff =
    goalDiff > 0 ? effectiveHomeElo - awayElo : goalDiff < 0 ? awayElo - effectiveHomeElo : 0;
  const multiplier = goalDifferenceMultiplier(goalDiff, winnerEloDiff);

  const newHomeElo = homeElo + k * multiplier * (actualHome - expectedHome);
  const newAwayElo = awayElo + k * multiplier * (actualAway - expectedAway);

  return { newHomeElo, newAwayElo };
}

/** Splits a raw ELO gap into a three-way 1X2 probability. Plain ELO's
 *  `expectedScore` only produces a binary win-probability-like number, with
 *  no native notion of a draw — turning that into a 1X2 split requires a
 *  modeling choice, and we're explicit here about which one we made:
 *
 *  1. `pHomeOrAway = expectedScore(eloDiff, 0)` (the standard logistic ELO
 *     curve) gives the relative home-vs-away win strength, ignoring draws.
 *  2. Draw probability is modeled as a Gaussian bump centered on
 *     `eloDiff = 0` (evenly matched teams draw most often) that decays as
 *     the gap widens (long-shot mismatches rarely end level) — the same
 *     qualitative shape used by public ELO-based match-odds writeups (e.g.
 *     the FiveThirtyEight SPI match-probability methodology, which also
 *     derives a draw probability that shrinks with the rating gap and
 *     splits the remainder by relative strength). `drawConstant` is the
 *     draw probability at `eloDiff = 0`; a fixed decay width of 300 ELO
 *     points is baked in (roughly: two teams 300 points apart in strength
 *     have their draw chance cut to about a third of the even-match peak).
 *  3. The remaining `1 - draw` probability mass is split between home/away
 *     proportional to `pHomeOrAway`, so both marginals move together.
 *
 *  This is a deliberately simple, honestly-approximate formula — not a
 *  fitted or published model — good enough to produce a sane, testable
 *  1X2 split for the `elo` model option; the `blend`/`dixon-coles` models
 *  are where the real predictive power is expected to live (per
 *  docs/alpha/06-football-model.md §3 and §6). */
export function eloTo1X2(eloDiff: number, drawConstant = 0.28): OneXTwoProbabilities {
  const DRAW_DECAY_WIDTH = 300;
  const pHome = expectedScore(eloDiff, 0);
  const draw = drawConstant * Math.exp(-((eloDiff / DRAW_DECAY_WIDTH) ** 2));
  const remainder = 1 - draw;
  return {
    home: remainder * pHome,
    draw,
    away: remainder * (1 - pHome),
  };
}
