import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { checkAndConsume } from "../rateBudget";

/** odds-api.io client — docs/alpha/06-football-model.md §1 item 2: Bet9ja +
 *  SportyBet odds across 1X2, O/U 2.5, BTTS, and double chance. Plain typed
 *  `fetch`, no SDK.
 *
 *  ENDPOINT SHAPE ASSUMPTION (explicitly not verified against a live key,
 *  per this task's standing rule — "implement against the documented API,
 *  skip its conformance test with the reason"): docs/alpha/02-market-
 *  landscape.md §2 confirms odds-api.io is "the only documented odds API
 *  that lists Bet9ja and SportyBet" and its free-tier limits, but does not
 *  reproduce its exact request/response JSON shape, and this environment
 *  has no `ODDS_API_IO_KEY` to probe it live. The shape below follows the
 *  near-universal convention shared by essentially every odds-aggregator
 *  REST API in this space (The Odds API's `/v4/sports/{sport}/odds`
 *  response — bookmakers[] -> markets[] -> outcomes[] — is the best-known
 *  public example of this exact convention, and odds-api.io's own docs page
 *  cited in 02-market-landscape.md advertises itself as a like-for-like
 *  alternative to it): a single endpoint returning fixtures, each carrying
 *  a `bookmakers[]` array, each bookmaker carrying `markets[]`, each market
 *  carrying `outcomes[]` of `{name, price}` decimal-odds pairs. If the real
 *  API differs, only `mapEnvelope` below (and the request query params in
 *  `fetchOddsSnapshots`) need to change — every caller consumes the already
 *  -normalized `OddsSnapshotInput[]` shape, not this file's raw types.
 *
 *  Rate budget: the free tier is dual-windowed (100/hour AND 500/day,
 *  docs/alpha/02-market-landscape.md §2) but `alpha_rate_budget` only
 *  models one window per provider row (docs/alpha/04-schema.md). This
 *  module checks BOTH constraints as two independently-tracked provider
 *  keys (`"odds-api.io"` hourly, `"odds-api.io-daily"` daily) before every
 *  call. This is not perfectly atomic across the two rows — a call that
 *  passes the hourly check but fails the daily one has "spent" an hourly
 *  token for nothing — an honest, documented tradeoff of the single-window
 *  schema rather than a silent gap. */

type Client = SupabaseClient<Database>;

const BASE = "https://odds-api.io/api/v2"; // ASSUMPTION — see module header
const PROVIDER_HOURLY = "odds-api.io";
const PROVIDER_DAILY = "odds-api.io-daily";
const HOURLY_BUDGET = { limitPerWindow: 100, windowSeconds: 3_600 };
const DAILY_BUDGET = { limitPerWindow: 500, windowSeconds: 86_400 };

export type OddsApiMarketKey = "1x2" | "ou25" | "btts" | "dc";
export type OddsApiOutcomeKey = "home" | "draw" | "away" | "over" | "under" | "yes" | "no" | "hd" | "da" | "ha";

/** Normalized shape every caller (the ingest job, `fixtureFeatures.ts`,
 *  `predictFixture.ts`) works with — matches `alpha_odds_snapshots`'
 *  columns 1:1 so an ingest job can pass this straight to `.insert()`. */
export interface OddsSnapshotInput {
  fixtureId: string;
  book: string;
  market: OddsApiMarketKey;
  outcome: OddsApiOutcomeKey;
  decimalOdds: number;
  ts: string;
}

// --- Raw response shape (see ENDPOINT SHAPE ASSUMPTION above) ---

interface RawOutcome {
  name: string;
  price: number;
}

interface RawMarket {
  key: string;
  outcomes: RawOutcome[];
}

interface RawBookmaker {
  key: string;
  lastUpdate?: string;
  markets: RawMarket[];
}

interface RawFixtureOdds {
  fixtureId: string;
  commenceTime?: string;
  bookmakers: RawBookmaker[];
}

interface RawEnvelope {
  data: RawFixtureOdds[];
}

const MARKET_KEY_MAP: Record<string, OddsApiMarketKey | undefined> = {
  "1x2": "1x2",
  h2h: "1x2", // The-Odds-API-style alias for a moneyline/1x2 market
  ou25: "ou25",
  totals: "ou25",
  btts: "btts",
  both_teams_to_score: "btts",
  dc: "dc",
  double_chance: "dc",
};

const OUTCOME_KEY_MAP: Record<string, OddsApiOutcomeKey | undefined> = {
  home: "home",
  draw: "draw",
  away: "away",
  over: "over",
  under: "under",
  yes: "yes",
  no: "no",
  hd: "hd",
  "1x": "hd",
  da: "da",
  x2: "da",
  ha: "ha",
  "12": "ha",
};

function mapEnvelope(raw: RawEnvelope, ts: string): OddsSnapshotInput[] {
  const out: OddsSnapshotInput[] = [];
  for (const fixture of raw.data ?? []) {
    for (const bookmaker of fixture.bookmakers ?? []) {
      for (const market of bookmaker.markets ?? []) {
        const marketKey = MARKET_KEY_MAP[market.key.toLowerCase()];
        if (!marketKey) continue; // unrecognized market — skip rather than guess
        for (const outcome of market.outcomes ?? []) {
          const outcomeKey = OUTCOME_KEY_MAP[outcome.name.toLowerCase()];
          if (!outcomeKey || !Number.isFinite(outcome.price) || outcome.price <= 1) continue;
          out.push({
            fixtureId: fixture.fixtureId,
            book: bookmaker.key,
            market: marketKey,
            outcome: outcomeKey,
            decimalOdds: outcome.price,
            ts: bookmaker.lastUpdate ?? ts,
          });
        }
      }
    }
  }
  return out;
}

/** Checks and consumes both the hourly and daily budgets. Returns `false`
 *  (deny) if either is exhausted — never makes the network call otherwise. */
async function consumeOddsApiBudget(supabase: Client): Promise<boolean> {
  const hourly = await checkAndConsume(supabase, PROVIDER_HOURLY, HOURLY_BUDGET);
  if (!hourly.allowed) return false;
  const daily = await checkAndConsume(supabase, PROVIDER_DAILY, DAILY_BUDGET);
  return daily.allowed;
}

/** Fetches current odds for Bet9ja + SportyBet across 1X2/O-U-2.5/BTTS/
 *  double-chance for a date range (docs/alpha/06-football-model.md §1 item
 *  2). Returns `[]` (never throws) when `apiKey` is null, either budget is
 *  exhausted, or the call fails — same convention as `apiFootball.ts`. */
export async function fetchOddsSnapshots(
  apiKey: string | null,
  supabase: Client,
  opts: { dateFrom?: string; dateTo?: string; fixtureId?: string; bookmakers?: string[]; markets?: OddsApiMarketKey[] } = {},
): Promise<OddsSnapshotInput[]> {
  if (!apiKey) return [];
  const allowed = await consumeOddsApiBudget(supabase);
  if (!allowed) return [];

  const url = new URL(`${BASE}/fixtures/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("sport", "soccer");
  url.searchParams.set("bookmakers", (opts.bookmakers ?? ["bet9ja", "sportybet"]).join(","));
  url.searchParams.set("markets", (opts.markets ?? ["1x2", "ou25", "btts", "dc"]).join(","));
  if (opts.fixtureId) url.searchParams.set("fixtureId", opts.fixtureId);
  if (opts.dateFrom) url.searchParams.set("dateFrom", opts.dateFrom);
  if (opts.dateTo) url.searchParams.set("dateTo", opts.dateTo);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const raw = (await res.json()) as RawEnvelope;
    return mapEnvelope(raw, new Date().toISOString());
  } catch {
    return [];
  }
}

/** Exported for the ingest job / tests: turns a raw envelope already in
 *  hand into normalized snapshots, without a network call — the pure half
 *  of `fetchOddsSnapshots`. */
export function normalizeOddsEnvelope(raw: RawEnvelope, ts: string = new Date().toISOString()): OddsSnapshotInput[] {
  return mapEnvelope(raw, ts);
}
