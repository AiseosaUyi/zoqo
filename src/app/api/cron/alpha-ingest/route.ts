import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchFixturesByDateRange, fetchFixtureById } from "@/lib/alpha/providers/apiFootball";
import { fetchApiFootballOdds } from "@/lib/alpha/providers/apiFootballOdds";
import { fetchBet9jaOdds } from "@/lib/alpha/providers/bet9jaPublic";
import { fetchNairabetOdds } from "@/lib/alpha/providers/nairabetPublic";
import { NAIJABET_HOT_WINDOW_MS, type FixtureCandidate } from "@/lib/alpha/providers/naijaBetShared";
import { updateEloAfterResult, refitDixonColes } from "@/lib/alpha/ratings";
import { checkAndConsume } from "@/lib/alpha/rateBudget";

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
 *  `API_FOOTBALL_KEY` (added 2026-09-14) is a real, live, active free-plan
 *  key — verified against the real API from this machine. Its free tier
 *  has a real, load-bearing restriction: `league=&season=` fixture queries
 *  are blocked for any season after 2024 ("Free plans do not have access
 *  to this season"), so fixture ingest uses `fetchFixturesByDateRange`
 *  (date-only queries, no such restriction) instead — see that function's
 *  header in `providers/apiFootball.ts`. Without the key, fixture ingest,
 *  result polling, and `apiFootballOdds.ts` degrade to `[]`/`null`
 *  gracefully. Bet9ja/Nairabet (`bet9jaPublic.ts`/`nairabetPublic.ts`) are
 *  keyless and run every tick regardless, but still need `alpha_fixtures`
 *  rows to match against. odds-api.io (`oddsApiIo.ts`) is retired — its
 *  free tier is paused indefinitely, see docs/alpha/PROMPT-alpha-finish.md
 *  §4. */

const DEFAULT_LEAGUE_IDS = ["39", "140", "135", "78", "61", "2"]; // EPL, La Liga, Serie A, Bundesliga, Ligue 1, UCL — well-known public API-Football league ids
const LOOKAHEAD_DAYS = 7;
const HOT_WINDOW_MS = 48 * 60 * 60 * 1000; // fixtures inside this window get an odds-snapshot pass
const RESULT_POLL_DELAY_MS = 105 * 60 * 1000; // start polling for a result 105 min after kickoff, per the spec
const WEEKLY_REFIT_DAY_UTC = 1; // Monday
// fetchFixturesByDateRange costs one real API-Football call per day in the
// lookahead window (LOOKAHEAD_DAYS, below) — refreshing every 15-minute
// tick would burn the shared 100/day budget in under 2 hours (7 calls x 96
// ticks/day). Fixture schedules don't change intraday, so refreshing every
// 3 hours (8x/day x 7 calls = 56/day) leaves real headroom for lineups/
// injuries/results-polling/odds calls the rest of this route also makes.
const FIXTURE_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;

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
  const supabase = createServiceRoleClient();
  const now = Date.now();

  const leagueIds = await leaguesToIngest(supabase);
  const results = { fixturesUpserted: 0, oddsSnapshotsInserted: 0, resultsUpdated: 0, eloUpdated: 0, refits: [] as string[] };

  // One shared date-range fetch (see fetchFixturesByDateRange's header for
  // why this replaced a per-league league+season query — the free
  // API-Football plan rejects the current season on that combo entirely),
  // bucketed to the configured leagues here rather than each league
  // re-running the same date loop. Gated to once per FIXTURE_REFRESH_INTERVAL_MS
  // via the same token-bucket rateBudget.ts already uses elsewhere — this
  // consumes from the shared "api-football" budget exactly like every other
  // call in this route, so it competes fairly with lineups/injuries/odds/
  // results for the 100/day cap rather than having a separate carve-out.
  const refreshGate = await checkAndConsume(supabase, "api-football-fixture-refresh", {
    limitPerWindow: 1,
    windowSeconds: FIXTURE_REFRESH_INTERVAL_MS / 1000,
  });
  if (refreshGate.allowed) {
    const allFixtures = await fetchFixturesByDateRange(apiFootballKey, supabase, {
      from: new Date(now).toISOString().slice(0, 10),
      to: new Date(now + LOOKAHEAD_DAYS * 86_400_000).toISOString().slice(0, 10),
    });
    for (const f of allFixtures) {
      if (!leagueIds.includes(f.leagueId)) continue;
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
  // budget. Bet9ja/Nairabet (bet9jaPublic.ts/nairabetPublic.ts) fetch a
  // whole league in one call and match events to fixtures themselves — one
  // call per league, not per fixture, unlike API-Football's /odds which is
  // genuinely per-fixture. Each provider enforces its own rate budget/
  // circuit breaker internally (see their own headers) — this route only
  // decides which fixtures are hot enough to ask about.
  const { data: hotFixtures } = await supabase
    .from("alpha_fixtures")
    .select("id, league_id, home_team, away_team, kickoff_at")
    .in("league_id", leagueIds)
    .eq("status", "NS")
    .gte("kickoff_at", new Date(now).toISOString())
    .lte("kickoff_at", new Date(now + HOT_WINDOW_MS).toISOString())
    .limit(50);

  const hotByLeague = new Map<string, FixtureCandidate[]>();
  for (const f of hotFixtures ?? []) {
    const list = hotByLeague.get(f.league_id) ?? [];
    list.push({ id: f.id, home_team: f.home_team, away_team: f.away_team, kickoff_at: f.kickoff_at });
    hotByLeague.set(f.league_id, list);
  }

  async function insertSnapshots(snapshots: { fixtureId: string; book: string; market: string; outcome: string; decimalOdds: number; ts: string }[]) {
    if (snapshots.length === 0) return;
    const { error } = await supabase
      .from("alpha_odds_snapshots")
      .insert(snapshots.map((s) => ({ fixture_id: s.fixtureId, book: s.book, market: s.market, outcome: s.outcome, decimal_odds: s.decimalOdds, ts: s.ts })));
    if (!error) results.oddsSnapshotsInserted += snapshots.length;
  }

  for (const [leagueId, candidates] of hotByLeague) {
    const isHot = candidates.some((c) => new Date(c.kickoff_at).getTime() - now <= NAIJABET_HOT_WINDOW_MS);
    await insertSnapshots(await fetchBet9jaOdds(supabase, leagueId, candidates, { isHot }));
    await insertSnapshots(await fetchNairabetOdds(supabase, leagueId, candidates, { isHot }));
    for (const fixture of candidates) {
      await insertSnapshots(await fetchApiFootballOdds(apiFootballKey, supabase, fixture.id));
    }
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
