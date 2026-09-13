/** Time-decayed Dixon-Coles goal model — pure math, no I/O.
 *
 *  Source: Dixon, M.J. and Coles, S.G. (1997), "Modelling Association
 *  Football Scores and Inefficiencies in the Football Betting Market",
 *  Journal of the Royal Statistical Society: Series C, 46(2), 265-280.
 *  The low-score `tau` correction implemented below is that paper's own
 *  published formula, reproduced exactly. The reference open-source port
 *  this module follows the spirit of (per docs/alpha/02-market-landscape.md
 *  §5 and the repo's "copy from open source where faster, cite the source"
 *  convention) is `martineastwood/penaltyblog` (MIT) — this is a from-scratch
 *  TypeScript implementation written to the same published spec, not a
 *  line-for-line port (no dependency on that package was added; see
 *  docs/alpha/06-football-model.md §1 item 5 and §3 item 2).
 *
 *  Model: each team i has an attack strength and a defence strength (both
 *  in log space), plus one global home-advantage term, such that:
 *    expectedHomeGoals = exp(attack_home + defence_away + homeAdvantage)
 *    expectedAwayGoals = exp(attack_away + defence_home)
 *  Goals are Poisson-distributed around those expectations, independently,
 *  except for a hand-correction (`tau`) on the four low-scoring cells the
 *  independent-Poisson assumption is known to get wrong.
 *
 *  Fitting: a full gradient-based Poisson MLE (as `penaltyblog` and R's
 *  `glm`/`optim` do) is heavier machinery than this phase needs per the
 *  task brief, so `fitDixonColes` instead uses an iterative
 *  proportional-fitting-style coordinate ascent: because the model uses a
 *  canonical (log) link, the Poisson score equation for each team's attack
 *  parameter reduces to "weighted actual goals scored by this team across
 *  all its matches equals weighted fitted expected goals scored by this
 *  team" — the same identity iterative proportional fitting exploits for
 *  contingency tables, and the classic approach behind Maher's (1982)
 *  attack/defence football rating method. Each pass updates every team's
 *  attack, then every team's defence, then the home-advantage term, in
 *  closed form given the others fixed, and renormalizes to keep the
 *  attack/defence scale identifiable (the model is only identified up to a
 *  uniform shift: attack_i + c, defence_i - c leaves every match's
 *  expectation unchanged). This is a pragmatic, honestly-approximate
 *  fitting routine — not a verified-optimal MLE — capped at
 *  `MAX_FIT_PASSES` passes. `rho` (the low-score correlation parameter) is
 *  fit afterward by a capped 1-D search maximizing the weighted
 *  log-likelihood contribution of the `tau`-corrected cells, holding
 *  attack/defence/homeAdvantage fixed.
 */

import type { OneXTwoProbabilities } from "./types";

export interface HistoricalMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  /** Days before the reference/fit date this match was played. Used by the
   *  time-decay weight — larger = older = down-weighted. */
  daysAgo: number;
}

export interface DixonColesFit {
  attack: Record<string, number>;
  defence: Record<string, number>;
  homeAdvantage: number;
  rho: number;
}

/** Default time-decay rate per docs/alpha/06-football-model.md §1 item 5 —
 *  a match 100 days old is weighted `exp(-0.1)` ≈ 0.90 of a fresh one, a
 *  year-old match ≈ 0.30. */
export const DEFAULT_XI = 0.001;

const MAX_FIT_PASSES = 150;
const FIT_CONVERGENCE_TOLERANCE = 1e-7;
const MAX_RHO_SEARCH_ITERATIONS = 60;
const RHO_SEARCH_BOUNDS: [number, number] = [-0.3, 0.3];
const DEFAULT_MAX_GOALS = 10;

/** `exp(-xi * daysAgo)` — a match played `daysAgo` days before the fit
 *  reference date is weighted by this factor; 1.0 for a match today, decaying
 *  toward 0 for older matches. */
export function timeDecayWeight(daysAgo: number, xi = DEFAULT_XI): number {
  return Math.exp(-xi * Math.max(0, daysAgo));
}

/** Poisson probability mass function, `P(X = k) = exp(-lambda) * lambda^k / k!`. */
function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logPmf = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logPmf -= Math.log(i);
  return Math.exp(logPmf);
}

/** Dixon & Coles (1997)'s own published low-score correction. Independent
 *  Poisson systematically misprices the four scorelines where goals are
 *  scarce (0-0, 1-0, 0-1, 1-1) because real matches show slight negative
 *  correlation between the two teams' goal counts there (a team ahead
 *  1-0 tends to play more conservatively, suppressing further goals from
 *  both sides). `rho` < 0 is the typical fitted sign. */
export function tau(homeGoals: number, awayGoals: number, homeExpected: number, awayExpected: number, rho: number): number {
  if (homeGoals === 0 && awayGoals === 0) return 1 - homeExpected * awayExpected * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + homeExpected * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + awayExpected * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

function collectTeamIds(matches: HistoricalMatch[]): string[] {
  const ids = new Set<string>();
  for (const m of matches) {
    ids.add(m.homeTeamId);
    ids.add(m.awayTeamId);
  }
  return Array.from(ids);
}

/** Fits attack/defence strengths and a home-advantage term from historical
 *  match results, using the time-decay weighting described above. See the
 *  module header for the fitting method and its honest limitations. `rho`
 *  is fit in a second, capped 1-D search step. Returns a fit with
 *  `attack`/`defence` = 0 for every team seen (untouched teams simply
 *  aren't present in the returned maps — callers should treat a missing
 *  team as league-average, i.e. attack = defence = 0). */
export function fitDixonColes(matches: HistoricalMatch[], xi: number = DEFAULT_XI): DixonColesFit {
  const teamIds = collectTeamIds(matches);
  if (teamIds.length === 0) {
    return { attack: {}, defence: {}, homeAdvantage: 0, rho: 0 };
  }

  const attack: Record<string, number> = {};
  const defence: Record<string, number> = {};
  for (const id of teamIds) {
    attack[id] = 0;
    defence[id] = 0;
  }
  let homeAdvantage = 0.2; // sane starting point; home teams score somewhat more on average

  const weights = matches.map((m) => timeDecayWeight(m.daysAgo, xi));

  // Precompute, per team, the list of match indices where it plays home and
  // where it plays away, so each pass's per-team update is O(matches for
  // that team) rather than O(all matches) per team.
  const homeMatchesByTeam = new Map<string, number[]>();
  const awayMatchesByTeam = new Map<string, number[]>();
  for (const id of teamIds) {
    homeMatchesByTeam.set(id, []);
    awayMatchesByTeam.set(id, []);
  }
  matches.forEach((m, i) => {
    homeMatchesByTeam.get(m.homeTeamId)!.push(i);
    awayMatchesByTeam.get(m.awayTeamId)!.push(i);
  });

  for (let pass = 0; pass < MAX_FIT_PASSES; pass++) {
    let maxChange = 0;

    // --- update each team's attack, holding defence + homeAdvantage fixed ---
    for (const id of teamIds) {
      let scoredWeighted = 0;
      let expectedDenominator = 0;
      for (const i of homeMatchesByTeam.get(id)!) {
        const m = matches[i];
        const w = weights[i];
        scoredWeighted += w * m.homeGoals;
        expectedDenominator += w * Math.exp(defence[m.awayTeamId] + homeAdvantage);
      }
      for (const i of awayMatchesByTeam.get(id)!) {
        const m = matches[i];
        const w = weights[i];
        scoredWeighted += w * m.awayGoals;
        expectedDenominator += w * Math.exp(defence[m.homeTeamId]);
      }
      if (expectedDenominator > 0 && scoredWeighted > 0) {
        const newAttack = Math.log(scoredWeighted / expectedDenominator);
        maxChange = Math.max(maxChange, Math.abs(newAttack - attack[id]));
        attack[id] = newAttack;
      }
    }

    // --- update each team's defence, holding attack + homeAdvantage fixed ---
    for (const id of teamIds) {
      let concededWeighted = 0;
      let expectedDenominator = 0;
      for (const i of homeMatchesByTeam.get(id)!) {
        const m = matches[i];
        const w = weights[i];
        concededWeighted += w * m.awayGoals;
        expectedDenominator += w * Math.exp(attack[m.awayTeamId]);
      }
      for (const i of awayMatchesByTeam.get(id)!) {
        const m = matches[i];
        const w = weights[i];
        concededWeighted += w * m.homeGoals;
        expectedDenominator += w * Math.exp(attack[m.homeTeamId] + homeAdvantage);
      }
      if (expectedDenominator > 0 && concededWeighted > 0) {
        const newDefence = Math.log(concededWeighted / expectedDenominator);
        maxChange = Math.max(maxChange, Math.abs(newDefence - defence[id]));
        defence[id] = newDefence;
      }
    }

    // --- update the global home-advantage term ---
    {
      let homeGoalsWeighted = 0;
      let expectedDenominator = 0;
      matches.forEach((m, i) => {
        const w = weights[i];
        homeGoalsWeighted += w * m.homeGoals;
        expectedDenominator += w * Math.exp(attack[m.homeTeamId] + defence[m.awayTeamId]);
      });
      if (expectedDenominator > 0 && homeGoalsWeighted > 0) {
        const newHomeAdvantage = Math.log(homeGoalsWeighted / expectedDenominator);
        maxChange = Math.max(maxChange, Math.abs(newHomeAdvantage - homeAdvantage));
        homeAdvantage = newHomeAdvantage;
      }
    }

    // --- renormalize: shift attack down / defence up by the same constant
    // so the mean attack is 0 (the model is only identified up to this
    // uniform shift; pinning it down keeps the fit numerically stable
    // across passes rather than let it drift). ---
    const meanAttack = teamIds.reduce((s, id) => s + attack[id], 0) / teamIds.length;
    for (const id of teamIds) {
      attack[id] -= meanAttack;
      defence[id] += meanAttack;
    }

    if (maxChange < FIT_CONVERGENCE_TOLERANCE) break;
  }

  const rho = fitRho(matches, weights, attack, defence, homeAdvantage);

  return { attack, defence, homeAdvantage, rho };
}

/** Given fixed attack/defence/homeAdvantage, finds the `rho` that maximizes
 *  the weighted log-likelihood contribution of the tau-corrected low-score
 *  cells (the only cells where the likelihood depends on rho at all — see
 *  module header). Ternary search over a fixed bounded range, capped at
 *  `MAX_RHO_SEARCH_ITERATIONS` iterations; the objective is well-behaved
 *  (unimodal in practice for realistic data) over the narrow, football-
 *  literature-typical range in `RHO_SEARCH_BOUNDS`. */
function fitRho(
  matches: HistoricalMatch[],
  weights: number[],
  attack: Record<string, number>,
  defence: Record<string, number>,
  homeAdvantage: number,
): number {
  const expectations = matches.map((m) => ({
    homeExpected: Math.exp(attack[m.homeTeamId] + defence[m.awayTeamId] + homeAdvantage),
    awayExpected: Math.exp(attack[m.awayTeamId] + defence[m.homeTeamId]),
  }));

  const objective = (rho: number): number => {
    let ll = 0;
    matches.forEach((m, i) => {
      const { homeExpected, awayExpected } = expectations[i];
      const t = tau(m.homeGoals, m.awayGoals, homeExpected, awayExpected, rho);
      // tau can go non-positive for pathological rho; treat as -Infinity so
      // the search steers away from it instead of throwing on log(<=0).
      ll += weights[i] * Math.log(Math.max(t, 1e-12));
    });
    return ll;
  };

  let lo = RHO_SEARCH_BOUNDS[0];
  let hi = RHO_SEARCH_BOUNDS[1];
  for (let i = 0; i < MAX_RHO_SEARCH_ITERATIONS; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (objective(m1) < objective(m2)) {
      lo = m1;
    } else {
      hi = m2;
    }
    if (hi - lo < 1e-6) break;
  }
  return (lo + hi) / 2;
}

/** Expected goals for a fixture given a fit. Teams absent from the fit
 *  (never seen in the training matches) are treated as league-average
 *  (attack = defence = 0), so this never throws for an unknown team — it
 *  just degrades to a home-advantage-only estimate. */
export function expectedGoals(
  fit: DixonColesFit,
  homeTeamId: string,
  awayTeamId: string,
): { homeExpected: number; awayExpected: number } {
  const attackHome = fit.attack[homeTeamId] ?? 0;
  const defenceHome = fit.defence[homeTeamId] ?? 0;
  const attackAway = fit.attack[awayTeamId] ?? 0;
  const defenceAway = fit.defence[awayTeamId] ?? 0;
  return {
    homeExpected: Math.exp(attackHome + defenceAway + fit.homeAdvantage),
    awayExpected: Math.exp(attackAway + defenceHome),
  };
}

/** The `(maxGoals+1) x (maxGoals+1)` scoreline probability grid
 *  (`grid[homeGoals][awayGoals]`), independent Poisson with the Dixon-Coles
 *  low-score `tau` correction applied to the four affected cells, then
 *  renormalized to sum to 1 (the tau correction and the truncation at
 *  `maxGoals` both nudge the raw sum slightly away from 1). */
export function poissonGrid(homeExpected: number, awayExpected: number, rho: number, maxGoals: number = DEFAULT_MAX_GOALS): number[][] {
  const grid: number[][] = [];
  let total = 0;
  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPmf(h, homeExpected) * poissonPmf(a, awayExpected) * tau(h, a, homeExpected, awayExpected, rho);
      const clamped = Math.max(0, p);
      row.push(clamped);
      total += clamped;
    }
    grid.push(row);
  }
  if (total > 0) {
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        grid[h][a] /= total;
      }
    }
  }
  return grid;
}

/** Sums the grid into a home/draw/away probability triple. */
export function gridTo1X2(grid: number[][]): OneXTwoProbabilities {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      const p = grid[h][a];
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  return { home, draw, away };
}

/** Sums the grid into an over/under probability for total-goals `line`
 *  (typically an X.5 value, e.g. 2.5 — `over` = total goals strictly
 *  greater than `line`). */
export function gridToOverUnder(grid: number[][], line: number): { over: number; under: number } {
  let over = 0;
  let under = 0;
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      const p = grid[h][a];
      if (h + a > line) over += p;
      else under += p;
    }
  }
  return { over, under };
}

/** Sums the grid into a both-teams-to-score probability. */
export function gridToBtts(grid: number[][]): { yes: number; no: number } {
  let yes = 0;
  let no = 0;
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      const p = grid[h][a];
      if (h > 0 && a > 0) yes += p;
      else no += p;
    }
  }
  return { yes, no };
}
