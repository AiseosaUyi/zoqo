import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { updateElo, DEFAULT_HOME_ADVANTAGE } from "./football/elo";
import { fitDixonColes, type HistoricalMatch } from "./football/dixonColes";

/** Bridges the pure football math (`football/elo.ts`, `football/dixonColes.ts`
 *  — untouched, per this task's hard rule) to the database: reads/writes
 *  `alpha_team_ratings` and `alpha_fixtures`. Called by whatever schedules
 *  the ingest pipeline (after every FT result for ELO, weekly per league for
 *  the Dixon-Coles refit, per docs/alpha/06-football-model.md §1 item 5) —
 *  plain callable functions, not a route or React code, same shape as
 *  `settle.ts`/`evaluate.ts`.
 *
 *  PATH NOTE: docs/alpha/plans/phase-3-football.md's own file list places
 *  this at `src/lib/alpha/ratings.ts` (this file), while the task brief's
 *  numbered section 2 header says `src/lib/alpha/football/ratings.ts`. This
 *  task's hard rules also say "do not modify anything under
 *  src/lib/alpha/football/" — that directory is the frozen pure-math
 *  surface (types/margin/elo/dixonColes/models/metrics, already committed).
 *  Placed here, matching the reviewed plan doc and keeping every DB-touching
 *  line out of the directory the hard rule protects.
 *
 *  SCHEMA NOTE (documented limitation, not a bug): `alpha_team_ratings`
 *  (docs/alpha/04-schema.md) stores `attack`/`defence` per team but has no
 *  columns for a Dixon-Coles fit's global `homeAdvantage`/`rho` terms —
 *  those are fit-level, not team-level. `refitDixonColes` below computes and
 *  uses them for THIS fit, but only persists the two team-level numbers the
 *  schema actually has room for. `features/fixtureFeatures.ts` and
 *  `predictFixture.ts`, which reconstruct a `DixonColesFit` later purely
 *  from `alpha_team_ratings` rows, both fall back to `dixonColes.ts`'s own
 *  neutral starting values for the two missing fit-level terms — documented
 *  again at each of those call sites. */

type Client = SupabaseClient<Database>;

const DEFAULT_STARTING_ELO = 1500;
const COMPLETED_STATUSES = ["FT", "AET", "PEN"];

async function latestElo(supabase: Client, teamId: string): Promise<number> {
  const { data } = await supabase
    .from("alpha_team_ratings")
    .select("elo")
    .eq("team_id", teamId)
    .not("elo", "is", null)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.elo ?? DEFAULT_STARTING_ELO;
}

export type RatingsResult = { ok: true } | { ok: false; reason: string };

/** Reads a fixture's result + both teams' current ELO (latest
 *  `alpha_team_ratings` row per team, or `DEFAULT_STARTING_ELO` if none
 *  exists), calls `updateElo` (K=20, home adv 60 — `elo.ts`'s own defaults,
 *  not overridden here), and writes new rows dated today. Idempotent per
 *  call-day: re-running this for the same fixture on the same UTC day
 *  upserts the same `(team_id, as_of)` row rather than double-applying the
 *  update — but re-running on a LATER day would double-apply the result
 *  against the day-old rating, since this function has no "already
 *  processed this fixture" marker of its own. The caller (a future ingest
 *  job, out of this task's scope per the brief) owns calling this exactly
 *  once per fixture, right after its result lands. */
export async function updateEloAfterResult(supabase: Client, fixtureId: string): Promise<RatingsResult> {
  const { data: fixture } = await supabase
    .from("alpha_fixtures")
    .select("home_team_id, away_team_id, home_goals, away_goals, status")
    .eq("id", fixtureId)
    .maybeSingle();
  if (!fixture) return { ok: false, reason: "fixture not found" };
  if (!COMPLETED_STATUSES.includes(fixture.status)) {
    return { ok: false, reason: `fixture status "${fixture.status}" is not a completed result` };
  }
  if (fixture.home_goals == null || fixture.away_goals == null) {
    return { ok: false, reason: "fixture has no recorded score" };
  }

  const [homeElo, awayElo] = await Promise.all([latestElo(supabase, fixture.home_team_id), latestElo(supabase, fixture.away_team_id)]);
  const { newHomeElo, newAwayElo } = updateElo({
    homeElo,
    awayElo,
    homeGoals: fixture.home_goals,
    awayGoals: fixture.away_goals,
  });

  const asOf = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("alpha_team_ratings").upsert(
    [
      { team_id: fixture.home_team_id, as_of: asOf, elo: newHomeElo },
      { team_id: fixture.away_team_id, as_of: asOf, elo: newAwayElo },
    ],
    { onConflict: "team_id,as_of" },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export interface RefitDixonColesResult {
  ok: true;
  teamsFitted: number;
  homeAdvantage: number;
  rho: number;
}

/** Reads recent `alpha_fixtures` results for `leagueId` within
 *  `lookbackSeasons` (default 4, per docs/alpha/06-football-model.md §1 item
 *  5's "refit weekly on the last 4 seasons"), maps to `HistoricalMatch[]`,
 *  calls `fitDixonColes`, and persists the fitted `attack`/`defence` per
 *  team (see module header for why `homeAdvantage`/`rho` aren't persisted —
 *  they're still returned here so a caller that wants them for this one
 *  fit's lifetime can use them immediately). Season numbering follows
 *  API-Football's convention (a season is identified by its starting
 *  year — e.g. `2026` for the 2026-27 European season); `lookbackSeasons`
 *  is applied as `season >= currentSeasonGuess - lookbackSeasons + 1`. */
export async function refitDixonColes(
  supabase: Client,
  leagueId: string,
  lookbackSeasons = 4,
): Promise<RefitDixonColesResult | { ok: false; reason: string }> {
  const now = Date.now();
  const currentSeasonGuess = new Date(now).getUTCFullYear();
  const minSeason = currentSeasonGuess - lookbackSeasons + 1;

  const { data: fixtures, error } = await supabase
    .from("alpha_fixtures")
    .select("home_team_id, away_team_id, home_goals, away_goals, kickoff_at, season, status")
    .eq("league_id", leagueId)
    .gte("season", minSeason)
    .in("status", COMPLETED_STATUSES)
    .not("home_goals", "is", null)
    .not("away_goals", "is", null);
  if (error) return { ok: false, reason: error.message };
  if (!fixtures || fixtures.length === 0) {
    return { ok: false, reason: `no completed fixtures found for league "${leagueId}" within the last ${lookbackSeasons} season(s)` };
  }

  const matches: HistoricalMatch[] = fixtures.map((f) => ({
    homeTeamId: f.home_team_id,
    awayTeamId: f.away_team_id,
    homeGoals: f.home_goals!,
    awayGoals: f.away_goals!,
    daysAgo: Math.max(0, Math.round((now - new Date(f.kickoff_at).getTime()) / 86_400_000)),
  }));

  const fit = fitDixonColes(matches);
  const teamIds = Object.keys(fit.attack);
  if (teamIds.length === 0) return { ok: false, reason: "fit produced no teams (unexpected for a non-empty match set)" };

  const asOf = new Date(now).toISOString().slice(0, 10);
  const rows = teamIds.map((teamId) => ({ team_id: teamId, as_of: asOf, attack: fit.attack[teamId], defence: fit.defence[teamId] }));
  const { error: upsertError } = await supabase.from("alpha_team_ratings").upsert(rows, { onConflict: "team_id,as_of" });
  if (upsertError) return { ok: false, reason: upsertError.message };

  return { ok: true, teamsFitted: rows.length, homeAdvantage: fit.homeAdvantage, rho: fit.rho };
}

/** Re-exported so callers that only need "what ELO do we currently have for
 *  this team" (e.g. `predictFixture.ts`, `features/fixtureFeatures.ts`)
 *  don't duplicate the same query — both of those modules read
 *  `alpha_team_ratings` directly for their own reasons (attack/defence too,
 *  which this function doesn't return), but this is the canonical
 *  ELO-with-a-sane-default lookup. */
export { latestElo, DEFAULT_STARTING_ELO, DEFAULT_HOME_ADVANTAGE };
