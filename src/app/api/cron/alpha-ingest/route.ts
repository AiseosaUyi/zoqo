import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchFixtures, fetchFixtureById } from "@/lib/alpha/providers/apiFootball";
import { fetchOddsSnapshots } from "@/lib/alpha/providers/oddsApiIo";
import { updateEloAfterResult, refitDixonColes } from "@/lib/alpha/ratings";

export const dynamic = "force-dynamic";

/** Data ingest (docs/alpha/06-football-model.md §1, docs/alpha/03-
 *  architecture.md §6) — pg_cron hits this every 15 minutes. The one cron
 *  route this repo's Phase 3 build left unwired: `providers/*.ts` and
 *  `ratings.ts` were built and unit-tested as standalone functions; this
 *  route is what actually calls them on a schedule.
 *
 *  Bounded work only, per the Vercel-timeout constraint every other cron
 *  route here already respects: fixtures for each configured league (7
 *  days ahead), one odds pass for fixtures inside 48h of kickoff, one
 *  result-polling pass for fixtures past kickoff, and an ELO update for
 *  any fixture that just finished. The heavier weekly Dixon-Coles refit
 *  only runs on the day-of-week gate below, not every 15-minute tick.
 *
 *  No `API_FOOTBALL_KEY`/`ODDS_API_IO_KEY` exist in this environment
 *  (docs/alpha/STATUS.md) — every provider call below degrades to `[]`/
 *  `null` gracefully (see providers/*.ts's own header comments), so this
 *  route is safe to schedule now and simply does nothing useful until a
 *  human supplies real keys. */

const DEFAULT_LEAGUE_IDS = ["39", "140", "135", "78", "61", "2"]; // EPL, La Liga, Serie A, Bundesliga, Ligue 1, UCL — well-known public API-Football league ids
const LOOKAHEAD_DAYS = 7;
const HOT_WINDOW_MS = 48 * 60 * 60 * 1000; // fixtures inside this window get an odds-snapshot pass
const RESULT_POLL_DELAY_MS = 105 * 60 * 1000; // start polling for a result 105 min after kickoff, per the spec
const WEEKLY_REFIT_DAY_UTC = 1; // Monday

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiFootballKey = process.env.API_FOOTBALL_KEY ?? null;
  const oddsApiKey = process.env.ODDS_API_IO_KEY ?? null;
  const supabase = createServiceRoleClient();
  const now = Date.now();

  const leagueIds = await leaguesToIngest(supabase);
  const results = { fixturesUpserted: 0, oddsSnapshotsInserted: 0, resultsUpdated: 0, eloUpdated: 0, refits: [] as string[] };

  for (const leagueId of leagueIds) {
    const fixtures = await fetchFixtures(apiFootballKey, supabase, {
      leagueId,
      season: new Date(now).getUTCFullYear(),
      from: new Date(now).toISOString().slice(0, 10),
      to: new Date(now + LOOKAHEAD_DAYS * 86_400_000).toISOString().slice(0, 10),
    });
    for (const f of fixtures) {
      const { error } = await supabase.from("alpha_fixtures").upsert(
        {
          id: f.id,
          league_id: f.leagueId,
          season: f.season,
          kickoff_at: f.kickoffAt,
          home_team_id: f.homeTeamId,
          home_team: f.homeTeam,
          away_team_id: f.awayTeamId,
          away_team: f.awayTeam,
          status: f.status,
          home_goals: f.homeGoals,
          away_goals: f.awayGoals,
          venue: f.venue,
          referee: f.referee,
        },
        { onConflict: "id" },
      );
      if (!error) results.fixturesUpserted++;
    }
  }

  // Odds snapshots for fixtures close enough to kickoff to be worth the
  // budget (see oddsApiIo.ts's header for the dual hourly/daily budget it
  // already enforces internally via checkAndConsume — this route just
  // decides WHICH fixtures are worth asking about, not whether it's
  // allowed to ask).
  const { data: hotFixtures } = await supabase
    .from("alpha_fixtures")
    .select("id, kickoff_at")
    .in("league_id", leagueIds)
    .eq("status", "NS")
    .gte("kickoff_at", new Date(now).toISOString())
    .lte("kickoff_at", new Date(now + HOT_WINDOW_MS).toISOString())
    .limit(20);
  for (const fixture of hotFixtures ?? []) {
    const snapshots = await fetchOddsSnapshots(oddsApiKey, supabase, { fixtureId: fixture.id });
    if (snapshots.length === 0) continue;
    const { error } = await supabase.from("alpha_odds_snapshots").insert(
      snapshots.map((s) => ({ fixture_id: s.fixtureId, book: s.book, market: s.market, outcome: s.outcome, decimal_odds: s.decimalOdds, ts: s.ts })),
    );
    if (!error) results.oddsSnapshotsInserted += snapshots.length;
  }

  // Result polling for fixtures past kickoff+105min that haven't reached a
  // terminal status yet — updates status/goals, then feeds a finished
  // result straight into the ELO update.
  const { data: liveFixtures } = await supabase
    .from("alpha_fixtures")
    .select("id, status")
    .in("league_id", leagueIds)
    .not("status", "in", '("FT","AET","PEN","CANC","PST")')
    .lte("kickoff_at", new Date(now - RESULT_POLL_DELAY_MS).toISOString())
    .limit(20);
  for (const fixture of liveFixtures ?? []) {
    const updated = await fetchFixtureById(apiFootballKey, supabase, fixture.id);
    if (!updated) continue;
    await supabase
      .from("alpha_fixtures")
      .update({ status: updated.status, home_goals: updated.homeGoals, away_goals: updated.awayGoals })
      .eq("id", fixture.id);
    results.resultsUpdated++;
    if (["FT", "AET", "PEN"].includes(updated.status) && updated.homeGoals != null && updated.awayGoals != null) {
      const eloResult = await updateEloAfterResult(supabase, fixture.id);
      if (eloResult.ok) results.eloUpdated++;
    }
  }

  // Weekly Dixon-Coles refit, per league, gated to one day of the week so
  // this heavier fit doesn't run every 15-minute tick.
  if (new Date(now).getUTCDay() === WEEKLY_REFIT_DAY_UTC) {
    for (const leagueId of leagueIds) {
      const refit = await refitDixonColes(supabase, leagueId);
      if (refit.ok) results.refits.push(leagueId);
    }
  }

  return NextResponse.json({ ok: true, leagues: leagueIds, ...results });
}

/** Union of every user's configured `alpha_settings.leagues` (football data
 *  is shared across users, per docs/alpha/04-schema.md's own comment on
 *  `alpha_fixtures`), falling back to a sane default set so ingest has
 *  something to do even before any user has configured leagues. */
async function leaguesToIngest(supabase: ReturnType<typeof createServiceRoleClient>): Promise<string[]> {
  const { data } = await supabase.from("alpha_settings").select("leagues");
  const configured = new Set<string>();
  for (const row of data ?? []) {
    for (const league of row.leagues ?? []) configured.add(league);
  }
  return configured.size > 0 ? [...configured] : DEFAULT_LEAGUE_IDS;
}
