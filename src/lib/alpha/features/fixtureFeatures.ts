import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { FeatureProvider } from "../core/strategy";
import { multiplicativeNormalize, shinProbabilities, overround } from "../football/margin";
import { eloTo1X2, DEFAULT_HOME_ADVANTAGE } from "../football/elo";
import { expectedGoals, poissonGrid, gridTo1X2, gridToOverUnder, gridToBtts, type DixonColesFit } from "../football/dixonColes";

/** Fixture features for football-venue strategies (docs/alpha/03-
 *  architecture.md §4, docs/alpha/06-football-model.md §2) — the
 *  `FeatureProvider.getFixtureFeatures` implementation, same shape
 *  `features/priceFeatures.ts` and `features/marketFeatures.ts` already
 *  establish: a factory taking a Supabase client (+ `now`) and returning a
 *  `FeatureProvider`.
 *
 *  Every field is OPTIONAL in the returned `Record<string, number | string>`
 *  — per the task brief, "return null gracefully for anything not
 *  computable... no feature may fabricate data." The whole function returns
 *  `null` only when the fixture itself doesn't exist; every individual
 *  sub-feature that can't be computed from what's actually stored is simply
 *  omitted from the object, never filled with a placeholder.
 *
 *  SCOPE NOTE: market-feature computation (implied probs, consensus,
 *  overround, line movement, cross-book divergence) is done for the 1X2
 *  market only — 06-football-model.md §2 doesn't restrict this, but doing
 *  it for every market (1x2/ou25/btts/dc) as well would roughly quadruple
 *  this module's size for outcomes the shipped strategies
 *  (`footballValue1x2`, `footballLineMove`) don't consume; `footballValueOu25`
 *  reads its own O/U odds directly rather than through this feature vector.
 *  A documented, bounded scope cut, not an oversight.
 *
 *  SCHEMA NOTE: several fields the model doc (§2) asks for have no
 *  supporting column in this schema (docs/alpha/04-schema.md) — competition
 *  stage / dead-rubber heuristic (no standings table), "key player out"
 *  (no stored player minutes/goals history), and referee cards/penalties
 *  per game (no per-referee stats table). These are omitted, not
 *  fabricated, and each omission is called out at its own would-be call
 *  site below rather than silently missing. */

const ONE_X_TWO_MARKET = "1x2";
const NEUTRAL_HOME_ADVANTAGE = 0.2; // see ../ratings.ts's SCHEMA NOTE — fit-level term not persisted
const NEUTRAL_RHO = 0; // ditto
const LINE_MOVE_24H_MS = 24 * 60 * 60 * 1000;
const LINE_MOVE_2H_MS = 2 * 60 * 60 * 1000;

type Client = SupabaseClient<Database>;
type Outcome = "home" | "draw" | "away";

interface OddsSnapshotRow {
  book: string;
  outcome: string;
  decimal_odds: number;
  ts: string;
}

/** Every 1X2 snapshot for this fixture, newest first — read once and reused
 *  by both "current consensus" and "line movement" below. */
async function readOneXTwoSnapshots(supabase: Client, fixtureId: string): Promise<OddsSnapshotRow[]> {
  const { data } = await supabase
    .from("alpha_odds_snapshots")
    .select("book, outcome, decimal_odds, ts")
    .eq("fixture_id", fixtureId)
    .eq("market", ONE_X_TWO_MARKET)
    .order("ts", { ascending: false });
  return data ?? [];
}

/** For each book, the most recent snapshot per outcome at or before
 *  `cutoffMs` (or the very latest, if `cutoffMs` is omitted) — `snapshots`
 *  is assumed newest-first, so the first match per (book, outcome) wins. */
function latestPerBookAt(snapshots: OddsSnapshotRow[], cutoffMs?: number): Map<string, Partial<Record<Outcome, number>>> {
  const byBook = new Map<string, Partial<Record<Outcome, number>>>();
  for (const s of snapshots) {
    if (cutoffMs != null && new Date(s.ts).getTime() > cutoffMs) continue;
    const outcome = s.outcome as Outcome;
    if (outcome !== "home" && outcome !== "draw" && outcome !== "away") continue;
    const entry = byBook.get(s.book) ?? {};
    if (entry[outcome] == null) entry[outcome] = s.decimal_odds;
    byBook.set(s.book, entry);
  }
  return byBook;
}

/** Consensus (mean across books, both margin-removal methods) at a given
 *  point in time. Returns `null` when no book has a complete 1X2 triple at
 *  or before that time — "not computable yet", not a fabricated 0.5/0.5/0.5. */
function consensusAt(
  snapshots: OddsSnapshotRow[],
  cutoffMs?: number,
): { multiplicative: Record<Outcome, number>; shin: Record<Outcome, number>; overroundMean: number; bookCount: number } | null {
  const byBook = latestPerBookAt(snapshots, cutoffMs);
  const complete: [number, number, number][] = [];
  for (const entry of byBook.values()) {
    if (entry.home != null && entry.draw != null && entry.away != null) complete.push([entry.home, entry.draw, entry.away]);
  }
  if (complete.length === 0) return null;

  const multi = complete.map((odds) => multiplicativeNormalize(odds));
  const shin = complete.map((odds) => shinProbabilities(odds));
  const overrounds = complete.map((odds) => overround(odds));
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

  return {
    multiplicative: { home: mean(multi.map((p) => p[0])), draw: mean(multi.map((p) => p[1])), away: mean(multi.map((p) => p[2])) },
    shin: { home: mean(shin.map((p) => p[0])), draw: mean(shin.map((p) => p[1])), away: mean(shin.map((p) => p[2])) },
    overroundMean: mean(overrounds),
    bookCount: complete.length,
  };
}

async function readTeamRating(supabase: Client, teamId: string) {
  const { data } = await supabase
    .from("alpha_team_ratings")
    .select("elo, attack, defence, xg_for_l5, xg_against_l5, form_l5, form_l10")
    .eq("team_id", teamId)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Days since `teamId`'s last fixture strictly before `kickoffAt`, or `null`
 *  if no prior fixture is on record. */
async function restDays(supabase: Client, teamId: string, kickoffAt: string): Promise<number | null> {
  const { data } = await supabase
    .from("alpha_fixtures")
    .select("kickoff_at")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .lt("kickoff_at", kickoffAt)
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const diffMs = new Date(kickoffAt).getTime() - new Date(data.kickoff_at).getTime();
  return Math.max(0, Math.round(diffMs / 86_400_000));
}

/** Last-5 head-to-head between these two team ids (either historical home
 *  or away combination), before this fixture. Doc §2 flags H2H as "not a
 *  strong predictor... include as a weak feature" — kept minimal: count and
 *  the current home team's win rate across whatever's on record. */
async function headToHead(supabase: Client, homeTeamId: string, awayTeamId: string, kickoffAt: string) {
  const { data } = await supabase
    .from("alpha_fixtures")
    .select("home_team_id, away_team_id, home_goals, away_goals, kickoff_at, status")
    .or(
      `and(home_team_id.eq.${homeTeamId},away_team_id.eq.${awayTeamId}),and(home_team_id.eq.${awayTeamId},away_team_id.eq.${homeTeamId})`,
    )
    .lt("kickoff_at", kickoffAt)
    .in("status", ["FT", "AET", "PEN"])
    .not("home_goals", "is", null)
    .not("away_goals", "is", null)
    .order("kickoff_at", { ascending: false })
    .limit(5);
  const matches = data ?? [];
  if (matches.length === 0) return null;
  let currentHomeWins = 0;
  for (const m of matches) {
    const homeGoals = m.home_goals!;
    const awayGoals = m.away_goals!;
    const winnerTeamId = homeGoals > awayGoals ? m.home_team_id : awayGoals > homeGoals ? m.away_team_id : null;
    if (winnerTeamId === homeTeamId) currentHomeWins++;
  }
  return { matches: matches.length, currentHomeWinRate: currentHomeWins / matches.length };
}

export function createFixtureFeatureProvider(supabase: Client, now: number): FeatureProvider {
  return {
    async getFixtureFeatures(fixtureId: string) {
      const { data: fixture } = await supabase
        .from("alpha_fixtures")
        .select("home_team_id, away_team_id, kickoff_at, lineups, injuries, referee")
        .eq("id", fixtureId)
        .maybeSingle();
      if (!fixture) return null;

      const features: Record<string, number | string> = {
        fixture_id: fixtureId,
        home_team_id: fixture.home_team_id,
        away_team_id: fixture.away_team_id,
      };

      // --- Market features: implied probs, consensus, overround, line movement ---
      const snapshots = await readOneXTwoSnapshots(supabase, fixtureId);
      const current = consensusAt(snapshots);
      if (current) {
        features.consensus_home_multiplicative = current.multiplicative.home;
        features.consensus_draw_multiplicative = current.multiplicative.draw;
        features.consensus_away_multiplicative = current.multiplicative.away;
        features.consensus_home_shin = current.shin.home;
        features.consensus_draw_shin = current.shin.draw;
        features.consensus_away_shin = current.shin.away;
        features.overround_mean = current.overroundMean;
        features.book_count = current.bookCount;

        // Line movement: current consensus vs opening / 24h-ago / 2h-ago
        // snapshots (docs/alpha/06-football-model.md §2). "Opening" is the
        // earliest snapshot on record for this fixture.
        const openingCutoff = snapshots.length > 0 ? new Date(snapshots[snapshots.length - 1].ts).getTime() : undefined;
        const opening = openingCutoff != null ? consensusAt(snapshots, openingCutoff) : null;
        const at24h = consensusAt(snapshots, now - LINE_MOVE_24H_MS);
        const at2h = consensusAt(snapshots, now - LINE_MOVE_2H_MS);
        for (const outcome of ["home", "draw", "away"] as const) {
          if (opening) features[`line_move_${outcome}_since_open`] = current.multiplicative[outcome] - opening.multiplicative[outcome];
          if (at24h) features[`line_move_${outcome}_24h`] = current.multiplicative[outcome] - at24h.multiplicative[outcome];
          if (at2h) features[`line_move_${outcome}_2h`] = current.multiplicative[outcome] - at2h.multiplicative[outcome];
        }

        // Cross-book divergence: spread (max - min) of raw implied
        // probability per outcome across whichever books are actually
        // quoting — a generalization of "Bet9ja vs SportyBet on the same
        // outcome" (06-football-model.md §2) to however many books this
        // fixture happens to have.
        const byBook = latestPerBookAt(snapshots);
        for (const outcome of ["home", "draw", "away"] as const) {
          const rawImplied = Array.from(byBook.values())
            .map((entry) => entry[outcome])
            .filter((v): v is number => v != null)
            .map((odds) => 1 / odds);
          if (rawImplied.length >= 2) features[`divergence_${outcome}`] = Math.max(...rawImplied) - Math.min(...rawImplied);
        }
      }

      // --- Team strength: ELO ---
      const [homeRating, awayRating] = await Promise.all([
        readTeamRating(supabase, fixture.home_team_id),
        readTeamRating(supabase, fixture.away_team_id),
      ]);
      if (homeRating?.elo != null && awayRating?.elo != null) {
        const eloDiff = homeRating.elo + DEFAULT_HOME_ADVANTAGE - awayRating.elo;
        features.elo_home = homeRating.elo;
        features.elo_away = awayRating.elo;
        features.elo_diff = eloDiff;
        const eloPred = eloTo1X2(eloDiff);
        features.elo_prob_home = eloPred.home;
        features.elo_prob_draw = eloPred.draw;
        features.elo_prob_away = eloPred.away;
      }

      // --- Team strength: Dixon-Coles (see module + ../ratings.ts header
      // notes on the neutral homeAdvantage/rho fallback) ---
      const hasAnyStrength = homeRating?.attack != null || awayRating?.attack != null || homeRating?.defence != null || awayRating?.defence != null;
      if (hasAnyStrength) {
        const fit: DixonColesFit = {
          attack: {
            ...(homeRating?.attack != null ? { [fixture.home_team_id]: homeRating.attack } : {}),
            ...(awayRating?.attack != null ? { [fixture.away_team_id]: awayRating.attack } : {}),
          },
          defence: {
            ...(homeRating?.defence != null ? { [fixture.home_team_id]: homeRating.defence } : {}),
            ...(awayRating?.defence != null ? { [fixture.away_team_id]: awayRating.defence } : {}),
          },
          homeAdvantage: NEUTRAL_HOME_ADVANTAGE,
          rho: NEUTRAL_RHO,
        };
        const { homeExpected, awayExpected } = expectedGoals(fit, fixture.home_team_id, fixture.away_team_id);
        const grid = poissonGrid(homeExpected, awayExpected, fit.rho);
        const dc1x2 = gridTo1X2(grid);
        const { over } = gridToOverUnder(grid, 2.5);
        const { yes } = gridToBtts(grid);
        features.dc_expected_goals_home = homeExpected;
        features.dc_expected_goals_away = awayExpected;
        features.dc_prob_home = dc1x2.home;
        features.dc_prob_draw = dc1x2.draw;
        features.dc_prob_away = dc1x2.away;
        features.dc_prob_over25 = over;
        features.dc_prob_btts_yes = yes;
      }

      // --- Form / xG (already computed onto alpha_team_ratings elsewhere) ---
      if (homeRating?.form_l5 != null) features.form_l5_home = homeRating.form_l5;
      if (awayRating?.form_l5 != null) features.form_l5_away = awayRating.form_l5;
      if (homeRating?.form_l10 != null) features.form_l10_home = homeRating.form_l10;
      if (awayRating?.form_l10 != null) features.form_l10_away = awayRating.form_l10;
      if (homeRating?.xg_for_l5 != null) features.xg_for_l5_home = homeRating.xg_for_l5;
      if (homeRating?.xg_against_l5 != null) features.xg_against_l5_home = homeRating.xg_against_l5;
      if (awayRating?.xg_for_l5 != null) features.xg_for_l5_away = awayRating.xg_for_l5;
      if (awayRating?.xg_against_l5 != null) features.xg_against_l5_away = awayRating.xg_against_l5;

      // --- Head to head (weak feature, per doc) ---
      const h2h = await headToHead(supabase, fixture.home_team_id, fixture.away_team_id, fixture.kickoff_at);
      if (h2h) {
        features.h2h_matches = h2h.matches;
        features.h2h_current_home_win_rate = h2h.currentHomeWinRate;
      }

      // --- Situational ---
      const [homeRest, awayRest] = await Promise.all([
        restDays(supabase, fixture.home_team_id, fixture.kickoff_at),
        restDays(supabase, fixture.away_team_id, fixture.kickoff_at),
      ]);
      if (homeRest != null) features.rest_days_home = homeRest;
      if (awayRest != null) features.rest_days_away = awayRest;

      // Lineup-known flag + injuries count, from the fixture's own jsonb
      // columns (populated by ingest, out of this task's scope — see
      // providers/apiFootball.ts's fetchLineups/fetchInjuries). "Key player
      // out" is NOT computed — this schema has no player minutes/goals
      // history to identify a "top-3 by minutes/goals" player (§2's own
      // definition), so it's omitted rather than approximated with a guess.
      features.lineup_known = fixture.lineups != null && (!Array.isArray(fixture.lineups) || fixture.lineups.length > 0) ? 1 : 0;
      if (Array.isArray(fixture.injuries)) features.injuries_count = fixture.injuries.length;
      if (fixture.referee) features.referee = fixture.referee;

      const kickoffDate = new Date(fixture.kickoff_at);
      features.kickoff_hour_utc = kickoffDate.getUTCHours();
      features.kickoff_day_of_week = kickoffDate.getUTCDay();
      // Epoch ms — the numeric form strategies actually need to gate on
      // "how long until kickoff" (see strategies/footballValue1x2.ts and
      // footballValueOu25.ts's `lookaheadHours` checks); kickoff_hour_utc/
      // kickoff_day_of_week alone don't carry enough information to compute
      // that distance.
      features.kickoff_at_ms = kickoffDate.getTime();

      return features;
    },
  };
}
