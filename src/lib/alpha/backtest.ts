import { fitDixonColes, type HistoricalMatch } from "./football/dixonColes";
import { updateElo, DEFAULT_HOME_ADVANTAGE } from "./football/elo";
import { marketModel, dixonColesModel, eloModel, blendModel, type FootballPrediction } from "./football/models";
import { rps, bootstrapRoiCI, hitRate, type BootstrapRoiCI } from "./football/metrics";
import type { OneXTwoOutcome } from "./football/types";

/** Walk-forward football backtest — a clean, reusable, exported entry
 *  point over the exact math `src/lib/alpha/__tests__/backtest.test.ts`
 *  already proved (that test now imports and asserts on this function
 *  rather than duplicating its logic inline, per this task's own "extract,
 *  don't leave DRY on the table" instruction). This is what Phase 5's
 *  `backtest_strategy` MCP tool (not built yet) and the `/alpha` "backtest"
 *  concept will eventually call.
 *
 *  Walk-forward discipline (unchanged from the original test): Dixon-Coles
 *  is fit ONCE on the chronologically earlier `trainFraction` of fixtures
 *  and evaluated, unrefit, on the remainder. ELO is updated sequentially
 *  match-by-match through the training set to build a rating snapshot, then
 *  walked forward through the test set one fixture at a time (predict, THEN
 *  update on that fixture's real result, before the next one) — no fixture
 *  is ever used for both fitting/rating-building and evaluation of itself.
 *
 *  CLV is intentionally NOT part of this function's output: this input
 *  format (see `BacktestFixtureInput`) carries exactly one odds snapshot
 *  per fixture — the closing line — with no earlier "taken" price on
 *  record to compare it against (docs/alpha/06-football-model.md §4's CLV
 *  needs both). Computing a nonzero CLV here would mean fabricating an
 *  entry price; a real per-strategy backtest (Phase 5) would use
 *  `alpha_odds_snapshots`' actual multi-snapshot history for that, which
 *  this synthetic single-snapshot-per-fixture format doesn't have. ROI is
 *  still computed (see `FootballBacktestModelStats.roi`) because a
 *  betting-rule return series doesn't require a second snapshot — only the
 *  price taken and the result. */

export interface BacktestFixtureInput {
  fixtureId: string;
  date: string;
  daysAgo: number;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  closingOdds: { home: number; draw: number; away: number };
}

export interface FootballBacktestModelStats {
  meanRps: number;
  n: number;
  /** Bootstrap 95% CI on per-bet ROI, only present for the `blend` model —
   *  the one the betting rule below actually stakes against (see header:
   *  the ROI series is illustrative, not a claim about live edge). */
  roi?: BootstrapRoiCI;
  hitRate?: number;
  nBets?: number;
}

export interface FootballBacktestResult {
  trainCount: number;
  testCount: number;
  models: {
    market: FootballBacktestModelStats;
    dixonColes: FootballBacktestModelStats;
    elo: FootballBacktestModelStats;
    blend: FootballBacktestModelStats;
  };
}

export interface FootballBacktestOptions {
  trainFraction?: number;
  /** Betting rule threshold for the illustrative ROI series (docs/alpha/
   *  06-football-model.md §3's "bet when edge >= min_edge", default 2%). */
  minEdge?: number;
}

function outcomeOf(f: BacktestFixtureInput): OneXTwoOutcome {
  if (f.homeGoals > f.awayGoals) return "home";
  if (f.homeGoals < f.awayGoals) return "away";
  return "draw";
}

function meanRps(predictions: FootballPrediction[], outcomes: OneXTwoOutcome[]): number {
  if (predictions.length === 0) return 0;
  const values = predictions.map((p, i) => rps(p, outcomes[i]));
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pick1x2(prediction: FootballPrediction, outcome: OneXTwoOutcome): number {
  return outcome === "home" ? prediction.home : outcome === "draw" ? prediction.draw : prediction.away;
}

export function runFootballBacktest(fixtures: BacktestFixtureInput[], opts: FootballBacktestOptions = {}): FootballBacktestResult {
  const trainFraction = Math.min(0.95, Math.max(0.05, opts.trainFraction ?? 0.7));
  const minEdge = opts.minEdge ?? 0.02;

  const trainCount = Math.floor(fixtures.length * trainFraction);
  const train = fixtures.slice(0, trainCount);
  const test = fixtures.slice(trainCount);

  // --- Dixon-Coles: fit once on TRAIN, never refit during evaluation. ---
  const cutoffDate = test.length > 0 ? new Date(test[0].date + "T00:00:00.000Z") : new Date();
  const dcTrainingMatches: HistoricalMatch[] = train.map((f) => {
    const matchDate = new Date(f.date + "T00:00:00.000Z");
    const daysAgo = Math.round((cutoffDate.getTime() - matchDate.getTime()) / 86_400_000);
    return { homeTeamId: f.homeTeam, awayTeamId: f.awayTeam, homeGoals: f.homeGoals, awayGoals: f.awayGoals, daysAgo };
  });
  const dcFit = fitDixonColes(dcTrainingMatches);

  // --- ELO: walk sequentially through TRAIN to build a rating snapshot,
  // then continue walking through TEST (predict-then-update per fixture). ---
  const eloRatings = new Map<string, number>();
  const DEFAULT_ELO = 1500;
  const getElo = (teamId: string) => eloRatings.get(teamId) ?? DEFAULT_ELO;
  for (const f of train) {
    const homeElo = getElo(f.homeTeam);
    const awayElo = getElo(f.awayTeam);
    const updated = updateElo({ homeElo, awayElo, homeGoals: f.homeGoals, awayGoals: f.awayGoals });
    eloRatings.set(f.homeTeam, updated.newHomeElo);
    eloRatings.set(f.awayTeam, updated.newAwayElo);
  }

  const marketPreds: FootballPrediction[] = [];
  const dcPreds: FootballPrediction[] = [];
  const eloPreds: FootballPrediction[] = [];
  const blendPreds: FootballPrediction[] = [];
  const outcomes: OneXTwoOutcome[] = [];
  const betReturns: number[] = [];

  for (const f of test) {
    const marketPred = marketModel([f.closingOdds]);
    const dcPred = dixonColesModel(dcFit, f.homeTeam, f.awayTeam);
    const homeElo = getElo(f.homeTeam);
    const awayElo = getElo(f.awayTeam);
    const eloDiff = homeElo + DEFAULT_HOME_ADVANTAGE - awayElo;
    const eloPred = eloModel(eloDiff);
    const blendPred = blendModel(marketPred, dcPred);
    const outcome = outcomeOf(f);

    marketPreds.push(marketPred);
    dcPreds.push(dcPred);
    eloPreds.push(eloPred);
    blendPreds.push(blendPred);
    outcomes.push(outcome);

    // Illustrative betting rule (docs/alpha/06-football-model.md §3): back
    // whichever outcome the blend model favors most, only if its edge over
    // the closing odds' own (margin-INCLUDED) implied probability clears
    // minEdge — same "beat the raw price" convention as
    // strategies/footballValue1x2.ts. Stakes a flat 1 unit per bet; the
    // return series feeds `bootstrapRoiCI`/`hitRate` below.
    const bestOutcome: OneXTwoOutcome = blendPred.home >= blendPred.draw && blendPred.home >= blendPred.away ? "home" : blendPred.draw >= blendPred.away ? "draw" : "away";
    const oddsForOutcome = f.closingOdds[bestOutcome];
    const rawImplied = 1 / oddsForOutcome;
    const edge = pick1x2(blendPred, bestOutcome) - rawImplied;
    if (edge >= minEdge) {
      betReturns.push(outcome === bestOutcome ? oddsForOutcome - 1 : -1);
    }

    // Walk ELO forward with this fixture's real result before the next one.
    const updated = updateElo({ homeElo, awayElo, homeGoals: f.homeGoals, awayGoals: f.awayGoals });
    eloRatings.set(f.homeTeam, updated.newHomeElo);
    eloRatings.set(f.awayTeam, updated.newAwayElo);
  }

  const blendStats: FootballBacktestModelStats = { meanRps: meanRps(blendPreds, outcomes), n: test.length };
  if (betReturns.length > 0) {
    blendStats.roi = bootstrapRoiCI(betReturns);
    blendStats.hitRate = hitRate(betReturns);
    blendStats.nBets = betReturns.length;
  }

  return {
    trainCount: train.length,
    testCount: test.length,
    models: {
      market: { meanRps: meanRps(marketPreds, outcomes), n: test.length },
      dixonColes: { meanRps: meanRps(dcPreds, outcomes), n: test.length },
      elo: { meanRps: meanRps(eloPreds, outcomes), n: test.length },
      blend: blendStats,
    },
  };
}
