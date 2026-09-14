import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { callApiFootball } from "./apiFootball";
import type { OddsSnapshotInput, OddsApiMarketKey, OddsApiOutcomeKey } from "./oddsApiIo";

/** API-Football (api-sports.io) `/odds` — docs/alpha/PROMPT-alpha-finish.md
 *  §4's replacement consensus/closing-line source now that odds-api.io's
 *  free tier is dead (see `oddsApiIo.ts`'s header). Same account, same
 *  100/day budget as `apiFootball.ts`'s fixtures/lineups/injuries calls
 *  (shares its `PROVIDER`/`DAILY_BUDGET` — see that file's export comment),
 *  included on the free plan per api-football.com/documentation-v3#tag/Odds.
 *
 *  Unverified live: no `API_FOOTBALL_KEY` in this environment (docs/alpha/
 *  STATUS.md) — `/odds` returned a real HTTP 403 ("no key") when probed
 *  from this machine, confirming the host is reachable, only the key is
 *  missing. Endpoint shape below follows the same v3 documentation
 *  `apiFootball.ts` already trusts (a stable, publicly documented API, not
 *  a guess like odds-api.io was). */

type Client = SupabaseClient<Database>;

// 1xBet, Betway, Bet365 preferred as the consensus books per the driving
// prompt — resolved to API-Football's own bookmaker ids via one
// /odds/bookmakers call (fetchOddsBookmakers below), cached by the caller.
export const PREFERRED_BOOKS = ["1xBet", "Betway", "Bet365"];

const MARKET_NAME_MAP: Record<string, OddsApiMarketKey | undefined> = {
  "match winner": "1x2",
  "home/away": "1x2",
  "double chance": "dc",
  "goals over/under": "ou25",
  "both teams score": "btts",
};

const OUTCOME_NAME_MAP: Record<string, OddsApiOutcomeKey | undefined> = {
  home: "home",
  draw: "draw",
  away: "away",
  over: "over",
  under: "under",
  yes: "yes",
  no: "no",
  "home/draw": "hd",
  "1x": "hd",
  "home/away": "ha",
  "12": "ha",
  "draw/away": "da",
  x2: "da",
};

interface RawBookmakerEnvelope {
  response: { id: number; name: string }[];
}

/** `GET /odds/bookmakers` — called once (per docs/alpha/05-mcp-spec.md's
 *  "once, to record ids") to resolve `PREFERRED_BOOKS`' names to
 *  API-Football's own numeric bookmaker ids, which `/odds`'s `bookmaker=`
 *  filter param requires. Returns `{}` (never throws) when unreachable. */
export async function fetchOddsBookmakers(apiKey: string | null, supabase: Client): Promise<Record<string, number>> {
  if (!apiKey) return {};
  const raw = await callApiFootball<RawBookmakerEnvelope>(apiKey, supabase, "/odds/bookmakers", {});
  const byName: Record<string, number> = {};
  for (const b of raw?.response ?? []) byName[b.name] = b.id;
  return byName;
}

interface RawOddValue {
  value: string;
  odd: string;
}

interface RawBet {
  id: number;
  name: string;
  values: RawOddValue[];
}

interface RawBookmakerOdds {
  id: number;
  name: string;
  bets: RawBet[];
}

interface RawOddsEnvelope {
  response: {
    fixture: { id: number };
    bookmakers: RawBookmakerOdds[];
  }[];
}

/** "Goals Over/Under" carries every line API-Football offers (Over 1.5,
 *  Over 2.5, Over 3.5, ...) in one bet's `values[]` — ZOQO only tracks the
 *  2.5 line (`ou25`), so this resolves an outcome value to `over`/`under`
 *  ONLY for that specific line; every other line is intentionally dropped,
 *  not guessed at. Non-O/U markets (1x2, double chance) match by plain name. */
function outcomeFor(marketKey: string, rawValue: string): OddsApiOutcomeKey | undefined {
  const value = rawValue.toLowerCase().trim();
  if (marketKey === "ou25") {
    if (value === "over 2.5") return "over";
    if (value === "under 2.5") return "under";
    return undefined;
  }
  return OUTCOME_NAME_MAP[value];
}

function mapOddsResponse(raw: RawOddsEnvelope, ts: string): OddsSnapshotInput[] {
  const out: OddsSnapshotInput[] = [];
  for (const fixture of raw.response ?? []) {
    const fixtureId = String(fixture.fixture.id);
    for (const bookmaker of fixture.bookmakers ?? []) {
      for (const bet of bookmaker.bets ?? []) {
        const market = MARKET_NAME_MAP[bet.name.toLowerCase()];
        if (!market) continue; // unrecognized market (API-Football exposes far more than the 4 this program tracks) — skip, don't guess
        for (const v of bet.values ?? []) {
          const outcome = outcomeFor(market, v.value);
          const decimalOdds = Number(v.odd);
          if (!outcome || !Number.isFinite(decimalOdds) || decimalOdds <= 1) continue;
          out.push({ fixtureId, book: bookmaker.name, market, outcome, decimalOdds, ts });
        }
      }
    }
  }
  return out;
}

/** `GET /odds?fixture=&bookmaker=` — one snapshot pass per fixture, filtered
 *  to `PREFERRED_BOOKS` when their ids are known (pass the map
 *  `fetchOddsBookmakers` returned; omitted, this asks for every book
 *  API-Football has odds from, which still normalizes fine — just noisier).
 *  Never throws; degrades to `[]`. */
export async function fetchApiFootballOdds(
  apiKey: string | null,
  supabase: Client,
  fixtureId: string,
  bookmakerIds?: number[],
): Promise<OddsSnapshotInput[]> {
  if (!apiKey) return [];
  const raw = await callApiFootball<RawOddsEnvelope>(apiKey, supabase, "/odds", {
    fixture: fixtureId,
    bookmaker: bookmakerIds && bookmakerIds.length === 1 ? bookmakerIds[0] : undefined,
  });
  if (!raw) return [];
  return mapOddsResponse(raw, new Date().toISOString());
}

/** Pure mapper exported for tests — same split as `oddsApiIo.ts`'s
 *  `normalizeOddsEnvelope`. */
export function normalizeApiFootballOdds(raw: RawOddsEnvelope, ts: string = new Date().toISOString()): OddsSnapshotInput[] {
  return mapOddsResponse(raw, ts);
}
