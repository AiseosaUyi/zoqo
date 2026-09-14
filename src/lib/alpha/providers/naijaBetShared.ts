import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { checkAndConsume } from "../rateBudget";

/** Shared plumbing for `bet9jaPublic.ts`/`nairabetPublic.ts` — both port
 *  https://github.com/jayteealao/NaijaBet_Api (MIT), commit
 *  0ae335dc90ba390949eac0de57f3f86f537ae025, and share three concerns
 *  neither bookmaker's own code needs to duplicate: mapping API-Football's
 *  league ids (the ids `alpha_fixtures.league_id` actually stores) to each
 *  bookmaker's own league id, a first-cut team-name-to-fixture matcher (raw
 *  bookmaker feeds return every match in a league, not a queryable
 *  fixture-id — same "not real entity resolution" honesty bar STATUS.md's
 *  Phase 4 already set for `kalshi-cross-venue-divergence`), and a rate
 *  budget + 24h circuit breaker (reusing `alpha_rate_budget`'s existing
 *  columns rather than a new schema column — see `tripCircuitBreaker`). */

type Client = SupabaseClient<Database>;

/** API-Football league id -> {bet9ja, nairabet} league ids, sourced from
 *  NaijaBet_Api/id.py's `Betid` enum. Only the 5 of `alpha-ingest`'s 6
 *  default leagues (docs/alpha/PROMPT-alpha-finish.md's own DEFAULT_LEAGUE_IDS
 *  in src/app/api/cron/alpha-ingest/route.ts) that Bet9ja/Nairabet actually
 *  carry — neither library exposes a Champions League (API-Football "2") id. */
export const LEAGUE_ID_MAP: Record<string, { bet9ja: number; nairabet: number; name: string }> = {
  "39": { bet9ja: 170880, nairabet: 841, name: "Premier League" }, // EPL
  "140": { bet9ja: 180928, nairabet: 1108, name: "La Liga" },
  "135": { bet9ja: 167856, nairabet: 3775, name: "Serie A" },
  "78": { bet9ja: 180923, nairabet: 1007, name: "Bundesliga" },
  "61": { bet9ja: 950503, nairabet: 1104, name: "Ligue 1" },
};

const STOPWORDS = new Set(["fc", "cf", "afc", "the", "de", "club", "sc", "cd", "ac"]);

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function overlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((w) => setB.has(w)).length;
  return shared / Math.max(a.length, b.length);
}

const MATCH_THRESHOLD = 0.5; // majority of significant tokens must overlap on BOTH sides
const KICKOFF_WINDOW_MS = 4 * 60 * 60 * 1000; // raw feeds' own kickoff time vs alpha_fixtures.kickoff_at can drift a little (TV reschedules, timezone rounding)

/** "Hot" cadence threshold both providers and the ingest route share:
 *  inside this window of kickoff, poll every 5 minutes instead of 15. */
export const NAIJABET_HOT_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface FixtureCandidate {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
}

/** First-cut token-overlap matcher, not real entity resolution — same
 *  honesty bar as `marketMatching.ts`/`kalshiCrossVenueDivergence.ts`.
 *  Returns the best-scoring candidate above `MATCH_THRESHOLD` on both home
 *  and away, or `null` if nothing clears the bar (an unmatched raw event is
 *  normal — most leagues carry far more matches than the 7-day lookahead
 *  window this program ingests — not an error). */
export function matchFixture(
  raw: { homeTeam: string; awayTeam: string; kickoffAtMs: number },
  candidates: FixtureCandidate[],
): FixtureCandidate | null {
  const homeTokens = tokenize(raw.homeTeam);
  const awayTokens = tokenize(raw.awayTeam);
  let best: { candidate: FixtureCandidate; score: number } | null = null;

  for (const c of candidates) {
    const kickoffMs = new Date(c.kickoff_at).getTime();
    if (Math.abs(kickoffMs - raw.kickoffAtMs) > KICKOFF_WINDOW_MS) continue;
    const homeScore = overlapScore(homeTokens, tokenize(c.home_team));
    const awayScore = overlapScore(awayTokens, tokenize(c.away_team));
    if (homeScore < MATCH_THRESHOLD || awayScore < MATCH_THRESHOLD) continue;
    const score = homeScore + awayScore;
    if (!best || score > best.score) best = { candidate: c, score };
  }
  return best?.candidate ?? null;
}

const BREAKER_WINDOW_SECONDS = 24 * 60 * 60;

/** Trips a 24h circuit breaker for `provider` on 403/429/an unexpected
 *  response shape — reuses `alpha_rate_budget`'s existing row instead of a
 *  new schema column (this session can't apply a schema migration — see
 *  docs/alpha/STATUS.md): sets `used = limit_per_window` on a fresh 24h
 *  window, so `checkAndConsume` denies every call for a full day through
 *  the same mechanism it already uses for a genuinely exhausted quota.
 *  Visible via `get_health`'s `rateBudgets` (`remaining: 0` for the
 *  provider) — no separate `alpha_events` row, since these providers are
 *  system-wide, not owned by one user (`alpha_events.user_id` is `not
 *  null`), so there is no single user to attribute the event to. */
export async function tripCircuitBreaker(supabase: Client, provider: string, limitPerWindow: number): Promise<void> {
  await supabase
    .from("alpha_rate_budget")
    .upsert(
      { provider, window_start: new Date().toISOString(), used: limitPerWindow, limit_per_window: limitPerWindow, window_seconds: BREAKER_WINDOW_SECONDS },
      { onConflict: "provider" },
    );
}

/** Normal cadence: at most once per 15 minutes. Hot cadence (any requested
 *  league has a fixture inside `hotWindowMs`, default 2h): once per 5
 *  minutes. One shared `alpha_rate_budget` row per provider — the cadence
 *  decision is per-invocation (does THIS batch touch a hot fixture), not
 *  per-league, since these providers fetch a whole league in one call. */
export async function checkNaijaBetBudget(supabase: Client, provider: string, isHot: boolean): Promise<boolean> {
  const windowSeconds = isHot ? 5 * 60 : 15 * 60;
  const result = await checkAndConsume(supabase, provider, { limitPerWindow: 1, windowSeconds });
  return result.allowed;
}

/** Browser-like headers so these public-JSON endpoints don't bounce a
 *  plain-Node `fetch` user-agent — matches the two adapters' own headers in
 *  NaijaBet_Api/bookmakers/{bet9ja,nairabet}.py. */
export const BET9JA_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  referer: "https://sports.bet9ja.com",
};

export const NAIRABET_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://nairabet.com/",
};
