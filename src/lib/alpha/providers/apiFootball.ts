import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { checkAndConsume } from "../rateBudget";

/** API-Football (api-sports.io) client — docs/alpha/06-football-model.md §1
 *  items 1, 3, 4: fixtures, results, lineups, injuries. Plain typed `fetch`,
 *  no SDK, per this phase's "no new npm dependencies" constraint. Every
 *  call goes through `checkAndConsume` (`../rateBudget.ts`) against the
 *  free-tier budget (100 req/day, docs/alpha/02-market-landscape.md §3)
 *  before hitting the network — never bypassed.
 *
 *  ENDPOINT SHAPE: this module targets API-Football v3
 *  (`https://v3.football.api-sports.io`, header `x-apisports-key`), which
 *  IS a stable, publicly documented API (api-football.com/documentation-v3)
 *  — unlike odds-api.io (see `oddsApiIo.ts`'s header), this shape is not a
 *  guess. It still can't be exercised end-to-end here: this environment has
 *  no `API_FOOTBALL_KEY` (docs/alpha/STATUS.md), so every function below
 *  degrades to `[]`/`null` when the key is absent, mirroring
 *  `venues/manifold.ts`'s "never throws, missing credential is a normal
 *  state" convention. Every raw-response type below is a deliberately
 *  narrowed slice of the real payload (only the fields this program
 *  actually reads) — the real API returns much more per fixture.
 *
 *  Rate budget: a single window models the documented 100/day free-tier
 *  cap (docs/alpha/06-football-model.md §1). Provider key `"api-football"`. */

type Client = SupabaseClient<Database>;

const BASE = "https://v3.football.api-sports.io";
const PROVIDER = "api-football";
const DAILY_BUDGET = { limitPerWindow: 100, windowSeconds: 86_400 };

export interface ApiFootballFixture {
  id: string;
  leagueId: string;
  season: number;
  kickoffAt: string;
  homeTeamId: string;
  homeTeam: string;
  awayTeamId: string;
  awayTeam: string;
  status: string;
  homeGoals: number | null;
  awayGoals: number | null;
  venue: string | null;
  referee: string | null;
}

export interface ApiFootballLineupEntry {
  teamId: string;
  formation: string | null;
  startXi: { playerId: string; playerName: string }[];
}

export interface ApiFootballInjury {
  playerId: string;
  playerName: string;
  teamId: string;
  type: string | null;
  reason: string | null;
}

// --- Raw response shapes (narrowed to what this module reads) ---

interface RawFixtureEnvelope {
  response: {
    fixture: { id: number; date: string; status: { short: string }; venue?: { name?: string | null }; referee?: string | null };
    league: { id: number; season: number };
    teams: { home: { id: number; name: string }; away: { id: number; name: string } };
    goals: { home: number | null; away: number | null };
  }[];
}

interface RawLineupsEnvelope {
  response: {
    team: { id: number };
    formation: string | null;
    startXI: { player: { id: number; name: string } }[];
  }[];
}

interface RawInjuriesEnvelope {
  response: {
    player: { id: number; name: string };
    team: { id: number };
    type?: string | null;
    reason?: string | null;
  }[];
}

function mapFixture(raw: RawFixtureEnvelope["response"][number]): ApiFootballFixture {
  return {
    id: String(raw.fixture.id),
    leagueId: String(raw.league.id),
    season: raw.league.season,
    kickoffAt: raw.fixture.date,
    homeTeamId: String(raw.teams.home.id),
    homeTeam: raw.teams.home.name,
    awayTeamId: String(raw.teams.away.id),
    awayTeam: raw.teams.away.name,
    status: raw.fixture.status.short,
    homeGoals: raw.goals.home,
    awayGoals: raw.goals.away,
    venue: raw.fixture.venue?.name ?? null,
    referee: raw.fixture.referee ?? null,
  };
}

/** Never throws — a network failure, a non-2xx response, or a denied rate
 *  budget all degrade to `null`, same convention as `venues/manifold.ts`'s
 *  `fetchJson`. */
export async function callApiFootball<T>(
  apiKey: string,
  supabase: Client,
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T | null> {
  const budget = await checkAndConsume(supabase, PROVIDER, DAILY_BUDGET);
  if (!budget.allowed) return null;
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  try {
    const res = await fetch(url.toString(), { headers: { "x-apisports-key": apiKey } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** `GET /fixtures?date=` — one calendar day, every league, filtered
 *  client-side to `leagueId`. Verified live 2026-09-14: the documented
 *  `GET /fixtures?league=&season=&from=&to=` combo this function used to
 *  call returns `{"errors":{"season":"Free plans do not have access to
 *  this season, try from 2022 to 2024."}}` on API-Football's free tier for
 *  ANY current/upcoming season (2025, 2026 both confirmed blocked) — the
 *  free plan is 2021-2024 historical data only, undocumented in
 *  docs/alpha/02-market-landscape.md's "100 req/day, all endpoints, all
 *  competitions" claim (now corrected there). `GET /fixtures?date=` has no
 *  such restriction and returns real current fixtures (confirmed: a real
 *  EPL fixture on 2026-09-14 this exact date-based call found, matching
 *  bet9ja's own live data for the same match) — it is the ONLY way this
 *  program can ingest upcoming fixtures on a free API-Football key.
 *  One real HTTP call per calendar day in `[from, to]` (inclusive), so a
 *  caller with N leagues configured pays date-range-length calls total,
 *  not N × date-range-length — see `alpha-ingest`'s own gating for how it
 *  keeps this within the 100/day shared budget. Never throws; a day whose
 *  call fails or is budget-denied just contributes no fixtures for that day. */
export async function fetchFixtures(
  apiKey: string | null,
  supabase: Client,
  opts: { leagueId: string; season: number; from?: string; to?: string },
): Promise<ApiFootballFixture[]> {
  const all = await fetchFixturesByDateRange(apiKey, supabase, opts);
  return all.filter((f) => f.leagueId === opts.leagueId);
}

/** The un-filtered form `fetchFixtures` wraps — one real HTTP call per
 *  calendar day regardless of how many leagues the caller ultimately cares
 *  about, since `GET /fixtures?date=` always returns every league at once.
 *  `alpha-ingest`'s route calls this ONCE per tick and buckets the result
 *  by league itself, rather than every configured league re-running (and
 *  re-paying for) the same date loop independently. */
export async function fetchFixturesByDateRange(
  apiKey: string | null,
  supabase: Client,
  opts: { from?: string; to?: string },
): Promise<ApiFootballFixture[]> {
  if (!apiKey) return [];
  const fromDate = opts.from ? new Date(opts.from) : new Date();
  const toDate = opts.to ? new Date(opts.to) : fromDate;
  const out: ApiFootballFixture[] = [];
  for (let d = new Date(fromDate); d.getTime() <= toDate.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const raw = await callApiFootball<RawFixtureEnvelope>(apiKey, supabase, "/fixtures", { date: dateStr });
    for (const entry of raw?.response ?? []) out.push(mapFixture(entry));
  }
  return out;
}

/** `GET /fixtures?id=` — result/status polling after kickoff
 *  (docs/alpha/06-football-model.md §1 item 3). Returns `null` (not `[]`)
 *  since callers want "the one fixture or nothing", mirroring
 *  `venues/manifold.ts`'s single-resource fetch convention. */
export async function fetchFixtureById(apiKey: string | null, supabase: Client, fixtureId: string): Promise<ApiFootballFixture | null> {
  if (!apiKey) return null;
  const raw = await callApiFootball<RawFixtureEnvelope>(apiKey, supabase, "/fixtures", { id: fixtureId });
  const first = raw?.response?.[0];
  return first ? mapFixture(first) : null;
}

/** `GET /fixtures/lineups?fixture=` — docs/alpha/06-football-model.md §1
 *  item 4. */
export async function fetchLineups(apiKey: string | null, supabase: Client, fixtureId: string): Promise<ApiFootballLineupEntry[]> {
  if (!apiKey) return [];
  const raw = await callApiFootball<RawLineupsEnvelope>(apiKey, supabase, "/fixtures/lineups", { fixture: fixtureId });
  return (raw?.response ?? []).map((entry) => ({
    teamId: String(entry.team.id),
    formation: entry.formation ?? null,
    startXi: entry.startXI.map((p) => ({ playerId: String(p.player.id), playerName: p.player.name })),
  }));
}

/** `GET /injuries?fixture=` — docs/alpha/06-football-model.md §1 item 4. */
export async function fetchInjuries(apiKey: string | null, supabase: Client, fixtureId: string): Promise<ApiFootballInjury[]> {
  if (!apiKey) return [];
  const raw = await callApiFootball<RawInjuriesEnvelope>(apiKey, supabase, "/injuries", { fixture: fixtureId });
  return (raw?.response ?? []).map((entry) => ({
    playerId: String(entry.player.id),
    playerName: entry.player.name,
    teamId: String(entry.team.id),
    type: entry.type ?? null,
    reason: entry.reason ?? null,
  }));
}
