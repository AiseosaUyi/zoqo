import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { OddsSnapshotInput } from "./oddsApiIo";
import { LEAGUE_ID_MAP, matchFixture, tripCircuitBreaker, checkNaijaBetBudget, BET9JA_HEADERS, type FixtureCandidate } from "./naijaBetShared";

/** Bet9ja public odds — keyless port of
 *  https://github.com/jayteealao/NaijaBet_Api's `bookmakers/bet9ja.py` +
 *  `id.py` (MIT, commit 0ae335dc90ba390949eac0de57f3f86f537ae025), per
 *  docs/alpha/PROMPT-alpha-finish.md §4 (odds-api.io's free tier is dead —
 *  see `oddsApiIo.ts`'s header). Verified LIVE from this machine on
 *  2026-09-13 against the real endpoint below: a real, current English
 *  Premier League response (21 fixtures, e.g. "Leeds Utd - Newcastle Utd"
 *  kicking off 2026-09-14T19:00:00Z) parsed correctly with real decimal
 *  odds across 1X2, double chance, and — a field the upstream Python
 *  library's own jmespath query doesn't extract but is present in the raw
 *  JSON — Over/Under 2.5 (`O["S_OU@2.5_O"]`/`O["S_OU@2.5_U"]`), added here
 *  since ZOQO tracks `ou25` as a market.
 *
 *  READ-ONLY, LOW-CADENCE, NEVER PLACES A BET. This program never submits
 *  anything to Bet9ja — it only reads the same public odds JSON their own
 *  desktop web client loads. Whether reading that JSON programmatically
 *  falls under Bet9ja's Terms & Conditions clause IV(4) ("extraction... of
 *  material from the Website") is Aise's call, not a decision this codebase
 *  makes for him — see docs/alpha/02-market-landscape.md §2 and
 *  06-football-model.md §1 for the same note in context. */

type Client = SupabaseClient<Database>;

const PROVIDER = "bet9ja";

// GROUPMARKETID=1 selects the default market group (1X2/DC/O-U — matches
// what NaijaBet_Api's own Betid.to_endpoint("bet9ja") requests); matches=true
// restricts to actual scheduled matches, not ante-post/outright markets.
function endpointFor(bet9jaLeagueId: number): string {
  return `https://sports.bet9ja.com/desktop/feapi/PalimpsestAjax/GetEventsInGroupV2?GROUPID=${bet9jaLeagueId}&DISP=0&GROUPMARKETID=1&matches=true`;
}

interface RawOdds {
  S_1X2_1?: string;
  S_1X2_X?: string;
  S_1X2_2?: string;
  S_DC_1X?: string;
  S_DC_12?: string;
  S_DC_X2?: string;
  "S_OU@2.5_O"?: string;
  "S_OU@2.5_U"?: string;
}

interface RawEvent {
  DS: string; // "Home - Away"
  GID: number;
  ID: number;
  STARTDATEUTC: string;
  O: RawOdds;
}

interface RawEnvelope {
  D?: { E?: RawEvent[] };
}

function parseOdds(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 1 ? n : null;
}

/** Pure mapper — takes a raw envelope plus the `alpha_fixtures` candidates
 *  already loaded for this league (so this function needs no Supabase
 *  client, matching `oddsApiIo.ts`'s `normalizeOddsEnvelope` split) and
 *  returns matched, normalized snapshots. Events that don't clear
 *  `matchFixture`'s threshold against any candidate are silently dropped —
 *  not every raw match is inside this program's 7-day ingest window. */
export function normalizeBet9jaEnvelope(raw: RawEnvelope, candidates: FixtureCandidate[], ts: string = new Date().toISOString()): OddsSnapshotInput[] {
  const out: OddsSnapshotInput[] = [];
  for (const event of raw.D?.E ?? []) {
    const parts = event.DS?.split(/\s-\s/);
    if (!parts || parts.length !== 2) continue;
    const [homeTeam, awayTeam] = parts;
    const kickoffAtMs = new Date(event.STARTDATEUTC).getTime();
    if (!Number.isFinite(kickoffAtMs)) continue;

    const fixture = matchFixture({ homeTeam, awayTeam, kickoffAtMs }, candidates);
    if (!fixture) continue;

    const legs: { market: OddsSnapshotInput["market"]; outcome: OddsSnapshotInput["outcome"]; odds: string | undefined }[] = [
      { market: "1x2", outcome: "home", odds: event.O.S_1X2_1 },
      { market: "1x2", outcome: "draw", odds: event.O.S_1X2_X },
      { market: "1x2", outcome: "away", odds: event.O.S_1X2_2 },
      { market: "dc", outcome: "hd", odds: event.O.S_DC_1X },
      { market: "dc", outcome: "ha", odds: event.O.S_DC_12 },
      { market: "dc", outcome: "da", odds: event.O.S_DC_X2 },
      { market: "ou25", outcome: "over", odds: event.O["S_OU@2.5_O"] },
      { market: "ou25", outcome: "under", odds: event.O["S_OU@2.5_U"] },
    ];
    for (const leg of legs) {
      const decimalOdds = parseOdds(leg.odds);
      if (decimalOdds == null) continue;
      out.push({ fixtureId: fixture.id, book: PROVIDER, market: leg.market, outcome: leg.outcome, decimalOdds, ts });
    }
  }
  return out;
}

/** Fetches and matches Bet9ja odds for one API-Football league id against
 *  `candidates` (the `alpha_fixtures` rows already loaded for that league —
 *  caller's responsibility, same shape `alpha-ingest`'s route already
 *  queries). Never throws: unmapped league, a tripped circuit breaker, a
 *  denied rate budget, or any fetch/parse failure all return `[]`. A 403,
 *  429, or a response missing the expected `D.E` shape trips the 24h
 *  breaker so a bookmaker-side change or block doesn't get hammered every
 *  15 minutes. */
export async function fetchBet9jaOdds(
  supabase: Client,
  apiFootballLeagueId: string,
  candidates: FixtureCandidate[],
  opts: { isHot?: boolean } = {},
): Promise<OddsSnapshotInput[]> {
  const mapped = LEAGUE_ID_MAP[apiFootballLeagueId];
  if (!mapped) return [];

  const allowed = await checkNaijaBetBudget(supabase, PROVIDER, opts.isHot ?? false);
  if (!allowed) return [];

  try {
    const res = await fetch(endpointFor(mapped.bet9ja), { headers: BET9JA_HEADERS });
    if (res.status === 403 || res.status === 429) {
      await tripCircuitBreaker(supabase, PROVIDER, 1);
      return [];
    }
    if (!res.ok) return [];
    const raw = (await res.json()) as RawEnvelope;
    if (!raw.D || !Array.isArray(raw.D.E)) {
      // Response came back 200 but not in the shape this module expects —
      // a bookmaker-side schema change is exactly the case the breaker
      // exists for, not just HTTP-level failures.
      await tripCircuitBreaker(supabase, PROVIDER, 1);
      return [];
    }
    return normalizeBet9jaEnvelope(raw, candidates, new Date().toISOString());
  } catch {
    return [];
  }
}
