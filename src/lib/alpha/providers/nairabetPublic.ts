import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { OddsSnapshotInput } from "./oddsApiIo";
import { LEAGUE_ID_MAP, matchFixture, tripCircuitBreaker, checkNaijaBetBudget, NAIRABET_HEADERS, type FixtureCandidate } from "./naijaBetShared";

/** Nairabet public odds — keyless port of
 *  https://github.com/jayteealao/NaijaBet_Api's `bookmakers/nairabet.py` +
 *  `id.py` (MIT, commit 0ae335dc90ba390949eac0de57f3f86f537ae025), per
 *  docs/alpha/PROMPT-alpha-finish.md §4.
 *
 *  UNVERIFIED LIVE FROM THIS MACHINE: `sports-api.nairabet.com` does not
 *  resolve from this development sandbox (`curl`: "Could not resolve host",
 *  DNS NXDOMAIN — confirmed with `nslookup`, not a timeout or a 403, so this
 *  is a real DNS gap, not a guess). This matches CLAUDE.md's documented
 *  pattern where certain external hosts are unreachable from this specific
 *  sandbox but reachable from Vercel production (its own example: Binance/
 *  Coinbase for BTC price). The upstream library runs a live-site pytest
 *  suite (`tests/test_nairabet_e2e.py`, `pytest.mark.live_site`) against
 *  this exact endpoint in its own CI, and its CHANGELOG shows active
 *  maintenance as recently as 2026-09-13 with no reported endpoint change —
 *  reasonable evidence the endpoint is live in a normal network even though
 *  it isn't reachable from here. Verify from a real deploy before trusting
 *  this path in production; the circuit breaker below trips on a DNS/
 *  connection failure exactly like a 403/429, so if the endpoint really has
 *  moved, this provider self-silences after one failed attempt instead of
 *  retrying every 15 minutes.
 *
 *  READ-ONLY, LOW-CADENCE, NEVER PLACES A BET — see `bet9jaPublic.ts`'s
 *  header for the same Terms & Conditions note (Aise's call, not this
 *  codebase's). */

type Client = SupabaseClient<Database>;

const PROVIDER = "nairabet";

function endpointFor(nairabetLeagueId: number): string {
  return `https://sports-api.nairabet.com/v2/events?country=NG&locale=en&group=g3&platform=desktop&sportId=SOCCER&competitionId=${nairabetLeagueId}&limit=10`;
}

interface RawOutcome {
  value: string;
}

interface RawMarket {
  outcomes: RawOutcome[];
}

interface RawEvent {
  eventNames: string[];
  startTime: string;
  id: number;
  markets: RawMarket[];
}

interface RawEnvelope {
  data?: { categories?: { competitions?: { events?: RawEvent[] }[] }[] };
}

function parseOdds(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 1 ? n : null;
}

/** Pure mapper — same split as `bet9jaPublic.ts`'s `normalizeBet9jaEnvelope`.
 *  Nairabet's events endpoint only carries a 1X2 market (no double chance
 *  or O/U in this response shape, per NaijaBet_Api's own jsonpaths.py) —
 *  ZOQO's `dc`/`ou25` markets simply never get a `nairabet` row, which is
 *  an honest gap, not a bug. */
export function normalizeNairabetEnvelope(raw: RawEnvelope, candidates: FixtureCandidate[], ts: string = new Date().toISOString()): OddsSnapshotInput[] {
  const out: OddsSnapshotInput[] = [];
  const events = raw.data?.categories?.[0]?.competitions?.[0]?.events ?? [];
  for (const event of events) {
    if (!event.eventNames || event.eventNames.length < 2) continue;
    const [homeTeam, awayTeam] = event.eventNames;
    const kickoffAtMs = new Date(event.startTime).getTime();
    if (!Number.isFinite(kickoffAtMs)) continue;

    const fixture = matchFixture({ homeTeam, awayTeam, kickoffAtMs }, candidates);
    if (!fixture) continue;

    const outcomes = event.markets?.[0]?.outcomes ?? [];
    const legs: { outcome: OddsSnapshotInput["outcome"]; odds: string | undefined }[] = [
      { outcome: "home", odds: outcomes[0]?.value },
      { outcome: "draw", odds: outcomes[1]?.value },
      { outcome: "away", odds: outcomes[2]?.value },
    ];
    for (const leg of legs) {
      const decimalOdds = parseOdds(leg.odds);
      if (decimalOdds == null) continue;
      out.push({ fixtureId: fixture.id, book: PROVIDER, market: "1x2", outcome: leg.outcome, decimalOdds, ts });
    }
  }
  return out;
}

/** Fetches and matches Nairabet odds for one API-Football league id.
 *  Same never-throws/circuit-breaker contract as `fetchBet9jaOdds` — a DNS
 *  failure, a connection refusal, a 403/429, or an unexpected response
 *  shape all trip the 24h breaker rather than retrying every 15 minutes. */
export async function fetchNairabetOdds(
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
    const res = await fetch(endpointFor(mapped.nairabet), { headers: NAIRABET_HEADERS });
    if (res.status === 403 || res.status === 429) {
      await tripCircuitBreaker(supabase, PROVIDER, 1);
      return [];
    }
    if (!res.ok) return [];
    const raw = (await res.json()) as RawEnvelope;
    if (!raw.data) {
      await tripCircuitBreaker(supabase, PROVIDER, 1);
      return [];
    }
    return normalizeNairabetEnvelope(raw, candidates, new Date().toISOString());
  } catch {
    // Covers the DNS-resolution failure documented in this module's header
    // (Node's fetch throws, it doesn't resolve to a response) — trip the
    // breaker so an actually-dead endpoint stops being retried every tick.
    await tripCircuitBreaker(supabase, PROVIDER, 1);
    return [];
  }
}
