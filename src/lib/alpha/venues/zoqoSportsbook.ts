import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { VenueAdapter, Intent, MarketRef, PlacedOrder, Settlement, ExecCtx } from "../core/venue";

/** ZOQO's own NGN paper sportsbook (docs/alpha/03-architecture.md §8,
 *  docs/alpha/06-football-model.md, docs/alpha/02-market-landscape.md §8
 *  decision 1) — the internal venue Nigerian football bets settle against,
 *  priced from real Bet9ja/SportyBet odds snapshots (`alpha_odds_snapshots`,
 *  populated by `providers/oddsApiIo.ts` via a future ingest job) and
 *  settled from real API-Football results (`alpha_fixtures.status`/goals,
 *  via `providers/apiFootball.ts`). No real book is ever scraped or bet
 *  against directly — see `02-market-landscape.md`'s own "no scraper places
 *  bets" decision.
 *
 *  MARKET ENCODING: a "market" here is the triple `fixtureId:market:outcome`
 *  (e.g. `"12345:1x2:home"`) — the whole triple is `MarketRef.marketId`,
 *  `outcomeId` is unused, per the task's own worked example. `side` on the
 *  `Intent`/`PlacedOrder` doesn't carry betting information for this venue
 *  (the outcome is already fully encoded in `marketId`) — every accepted
 *  side is treated as "back this outcome" (mirrors `manifold.ts` collapsing
 *  ZOQO's generic `IntentSide` union onto its own two-outcome shape).
 *
 *  BOOK SELECTION: `getQuote`/`place` pick the best (highest) current
 *  decimal odds across whichever books are quoting this exact fixture/
 *  market/outcome — "prefer the book with the better price," per
 *  06-football-model.md §3's betting rule. The chosen book is embedded in
 *  `PlacedOrder.venueOrderId` as `"<uuid>::<book>"` so `settle()` (which
 *  only ever receives `PlacedOrder`s back, not the raw `alpha_orders` row's
 *  own `book` column — `runner.ts`/`settle.ts` don't thread that column
 *  through, and this task doesn't touch either file) can recover it without
 *  a second table. `slip.ts` (which DOES write its own `alpha_orders` rows
 *  directly, bypassing `runner.ts`) separately persists the real `book`
 *  column.
 *
 *  SETTLEMENT SCHEMA LIMITATION (documented, not a bug): `alpha_fixtures`
 *  stores exactly one final score pair (`home_goals`/`away_goals`), not a
 *  separate 90-minute/full-time score alongside an after-extra-time one.
 *  Real 1X2/BTTS/O-U-2.5/double-chance markets conventionally settle on the
 *  90-minute score even when a match goes to extra time or penalties — this
 *  adapter can't reproduce that distinction with what's persisted, so it
 *  settles every market off whatever `home_goals`/`away_goals` ended up
 *  stored for a fixture in `FT`/`AET`/`PEN` status. `PST`/`CANC` fixtures
 *  void every open order on them per docs/alpha/03-architecture.md §8. */

type Client = SupabaseClient<Database>;

const STARTING_BALANCE_NGN = 100_000;
const MAX_RETRIES = 3;
const COMPLETED_STATUSES = ["FT", "AET", "PEN"];
const VOID_STATUSES = ["PST", "CANC"];

export type SportsbookMarketKey = "1x2" | "ou25" | "btts" | "dc";
export type SportsbookOutcomeKey = "home" | "draw" | "away" | "over" | "under" | "yes" | "no" | "hd" | "da" | "ha";

const OUTCOMES_BY_MARKET: Record<SportsbookMarketKey, SportsbookOutcomeKey[]> = {
  "1x2": ["home", "draw", "away"],
  ou25: ["over", "under"],
  btts: ["yes", "no"],
  dc: ["hd", "da", "ha"],
};

/** Parses `fixtureId:market:outcome`. Returns `null` on anything malformed
 *  rather than throwing — a strategy or a stale MarketRef producing garbage
 *  should fail as a clean rejection, not an unhandled exception. */
export function parseMarketId(marketId: string): { fixtureId: string; market: SportsbookMarketKey; outcome: SportsbookOutcomeKey } | null {
  const parts = marketId.split(":");
  if (parts.length !== 3) return null;
  const [fixtureId, market, outcome] = parts;
  if (!fixtureId || !isMarketKey(market) || !isOutcomeKey(outcome) || !OUTCOMES_BY_MARKET[market].includes(outcome)) return null;
  return { fixtureId, market, outcome };
}

function isMarketKey(v: string): v is SportsbookMarketKey {
  return v === "1x2" || v === "ou25" || v === "btts" || v === "dc";
}
function isOutcomeKey(v: string): v is SportsbookOutcomeKey {
  return v === "home" || v === "draw" || v === "away" || v === "over" || v === "under" || v === "yes" || v === "no" || v === "hd" || v === "da" || v === "ha";
}

export function encodeMarketId(fixtureId: string, market: SportsbookMarketKey, outcome: SportsbookOutcomeKey): string {
  return `${fixtureId}:${market}:${outcome}`;
}

/** Resolves whether `outcome` won, given a completed fixture's final score.
 *  Pure — exported for unit testing without a database. */
export function resolveOutcome(market: SportsbookMarketKey, outcome: SportsbookOutcomeKey, homeGoals: number, awayGoals: number): boolean {
  const homeWin = homeGoals > awayGoals;
  const awayWin = awayGoals > homeGoals;
  const draw = homeGoals === awayGoals;
  switch (market) {
    case "1x2":
      return (outcome === "home" && homeWin) || (outcome === "draw" && draw) || (outcome === "away" && awayWin);
    case "ou25": {
      const over = homeGoals + awayGoals > 2.5;
      return (outcome === "over" && over) || (outcome === "under" && !over);
    }
    case "btts": {
      const btts = homeGoals > 0 && awayGoals > 0;
      return (outcome === "yes" && btts) || (outcome === "no" && !btts);
    }
    case "dc":
      return (outcome === "hd" && (homeWin || draw)) || (outcome === "da" && (draw || awayWin)) || (outcome === "ha" && (homeWin || awayWin));
  }
}

async function readLedger(supabase: Client, userId: string): Promise<{ balance: number; updated_at: string } | null> {
  const { data } = await supabase.from("alpha_ledger").select("balance, updated_at").eq("user_id", userId).eq("venue", "zoqo-sportsbook").maybeSingle();
  return data;
}

/** Auto-provisions the ₦100,000 paper faucet on first reference — same
 *  "create on first use" convention as `service.ts`'s `getOrCreateVenue`. */
async function getOrCreateLedger(supabase: Client, userId: string): Promise<{ balance: number; updated_at: string }> {
  const existing = await readLedger(supabase, userId);
  if (existing) return existing;
  const insertRow = { user_id: userId, venue: "zoqo-sportsbook", currency: "NGN", balance: STARTING_BALANCE_NGN };
  const { data: inserted } = await supabase.from("alpha_ledger").insert(insertRow).select("balance, updated_at").single();
  return inserted ?? { balance: STARTING_BALANCE_NGN, updated_at: new Date().toISOString() };
}

/** Optimistic-concurrency debit/credit against `alpha_ledger.balance`,
 *  keyed on `updated_at` — exactly `terminalExecution.ts`'s
 *  `writeCashOptimistic` pattern, reused here since `alpha_ledger` carries
 *  its own `updated_at` column for exactly this (docs/alpha/04-schema.md). */
async function writeLedgerOptimistic(
  supabase: Client,
  userId: string,
  applyDelta: (balance: number) => number,
): Promise<{ ok: true; newBalance: number } | { ok: false; reason: string }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const row = await getOrCreateLedger(supabase, userId);
    const newBalance = applyDelta(row.balance);
    if (newBalance < 0) return { ok: false, reason: "insufficient balance" };
    const { data } = await supabase
      .from("alpha_ledger")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("venue", "zoqo-sportsbook")
      .eq("updated_at", row.updated_at)
      .select("user_id");
    if (data && data.length > 0) return { ok: true, newBalance };
    // 0 rows affected — a concurrent writer changed updated_at first; retry.
  }
  return { ok: false, reason: "concurrent ledger write conflict, exhausted retries" };
}

interface OddsRow {
  book: string;
  decimal_odds: number;
}

/** Latest decimal odds per book for one exact (fixture, market, outcome)
 *  triple, newest snapshot per book only. */
async function latestOddsPerBook(supabase: Client, fixtureId: string, market: SportsbookMarketKey, outcome: SportsbookOutcomeKey): Promise<OddsRow[]> {
  const { data } = await supabase
    .from("alpha_odds_snapshots")
    .select("book, decimal_odds, ts")
    .eq("fixture_id", fixtureId)
    .eq("market", market)
    .eq("outcome", outcome)
    .order("ts", { ascending: false });
  const seenBooks = new Set<string>();
  const latest: OddsRow[] = [];
  for (const row of data ?? []) {
    if (seenBooks.has(row.book)) continue;
    seenBooks.add(row.book);
    latest.push({ book: row.book, decimal_odds: row.decimal_odds });
  }
  return latest;
}

function bestPrice(rows: OddsRow[]): OddsRow | null {
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (b.decimal_odds > a.decimal_odds ? b : a));
}

/** The last snapshot at or before kickoff for this exact book/market/
 *  outcome = the closing line (docs/alpha/06-football-model.md §1 item 2:
 *  "final snapshot in the 5 min before kickoff = closing line"), used for
 *  CLV. Falls back to the taken price when no such snapshot exists (e.g.
 *  no ingest ever ran past the bet's placement) — a fallback that makes
 *  CLV read as exactly 0 rather than fabricating a number, which is the
 *  honest outcome when there's genuinely nothing to compare against. */
async function closingOddsFor(
  supabase: Client,
  fixtureId: string,
  market: SportsbookMarketKey,
  outcome: SportsbookOutcomeKey,
  book: string,
  kickoffAtIso: string,
  fallback: number,
): Promise<number> {
  const { data } = await supabase
    .from("alpha_odds_snapshots")
    .select("decimal_odds")
    .eq("fixture_id", fixtureId)
    .eq("market", market)
    .eq("outcome", outcome)
    .eq("book", book)
    .lte("ts", kickoffAtIso)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.decimal_odds ?? fallback;
}

/** Splits `"<uuid>::<book>"` back into its parts — see module header's
 *  BOOK SELECTION note. Malformed strings (no `::`) fall back to `null`
 *  book rather than throwing. */
function parseVenueOrderId(venueOrderId: string): { orderUuid: string; book: string | null } {
  const idx = venueOrderId.indexOf("::");
  if (idx === -1) return { orderUuid: venueOrderId, book: null };
  return { orderUuid: venueOrderId.slice(0, idx), book: venueOrderId.slice(idx + 2) };
}

export function createZoqoSportsbookAdapter(supabase: Client, userId: string): VenueAdapter {
  return {
    id: "zoqo-sportsbook",
    mode: "paper",
    currency: "NGN",

    async listMarkets({ query, category, limit }) {
      const market: SportsbookMarketKey = isMarketKey(category ?? "") ? (category as SportsbookMarketKey) : "1x2";
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("alpha_fixtures")
        .select("id, home_team, away_team, league_id, kickoff_at")
        .gte("kickoff_at", nowIso)
        .order("kickoff_at", { ascending: true })
        .limit(Math.min((limit ?? 50) * 4, 200));
      let fixtures = data ?? [];
      const needle = query?.toLowerCase();
      if (needle) {
        fixtures = fixtures.filter(
          (f) => f.home_team.toLowerCase().includes(needle) || f.away_team.toLowerCase().includes(needle) || f.league_id.toLowerCase().includes(needle),
        );
      }
      const refs: MarketRef[] = [];
      for (const f of fixtures) {
        for (const outcome of OUTCOMES_BY_MARKET[market]) {
          refs.push({ venue: "zoqo-sportsbook", marketId: encodeMarketId(f.id, market, outcome) });
        }
      }
      return refs.slice(0, limit ?? 50);
    },

    async getQuote(m) {
      const parsed = parseMarketId(m.marketId);
      if (!parsed) return null;
      const rows = await latestOddsPerBook(supabase, parsed.fixtureId, parsed.market, parsed.outcome);
      const best = bestPrice(rows);
      if (!best) return null;
      return { market: m, ts: Date.now(), decimalOdds: best.decimal_odds, impliedProb: 1 / best.decimal_odds, book: best.book };
    },

    async place(intent: Intent, stake: number, ctx: ExecCtx): Promise<PlacedOrder> {
      const parsed = parseMarketId(intent.market.marketId);
      const rejected = (priceOrOdds: number): PlacedOrder => ({
        venueOrderId: "",
        market: intent.market,
        side: intent.side,
        stake,
        currency: "NGN",
        priceOrOdds,
        placedAt: ctx.now,
        status: "rejected",
      });
      if (!parsed) return rejected(0);

      const rows = await latestOddsPerBook(supabase, parsed.fixtureId, parsed.market, parsed.outcome);
      const best = bestPrice(rows);
      if (!best) return rejected(0);

      const written = await writeLedgerOptimistic(supabase, userId, (balance) => balance - stake);
      if (!written.ok) return rejected(best.decimal_odds);

      const venueOrderId = `${crypto.randomUUID()}::${best.book}`;
      return {
        venueOrderId,
        market: intent.market,
        side: intent.side,
        stake,
        currency: "NGN",
        priceOrOdds: best.decimal_odds,
        placedAt: ctx.now,
        status: "filled",
      };
    },

    // Same reasoning as zoqoTerminal.ts/manifold.ts: alpha_orders is the
    // source of truth for "which orders Alpha placed" — settle.ts passes
    // the exact set into settle(open) below.
    async openOrders() {
      return [];
    },

    async settle(open: PlacedOrder[]): Promise<Settlement[]> {
      const settlements: Settlement[] = [];
      for (const order of open) {
        if (!order.venueOrderId) continue;
        const parsed = parseMarketId(order.market.marketId);
        if (!parsed) continue;

        const { data: fixture } = await supabase
          .from("alpha_fixtures")
          .select("status, home_goals, away_goals, kickoff_at")
          .eq("id", parsed.fixtureId)
          .maybeSingle();
        if (!fixture) continue;

        if (VOID_STATUSES.includes(fixture.status)) {
          // Void on postponement/cancellation — full refund, no pnl.
          await writeLedgerOptimistic(supabase, userId, (balance) => balance + order.stake);
          settlements.push({ venueOrderId: order.venueOrderId, outcome: "void", pnl: 0, settledAt: Date.now() });
          continue;
        }
        if (!COMPLETED_STATUSES.includes(fixture.status) || fixture.home_goals == null || fixture.away_goals == null) {
          continue; // still open, nothing to settle yet
        }

        const won = resolveOutcome(parsed.market, parsed.outcome, fixture.home_goals, fixture.away_goals);
        const pnl = won ? order.stake * (order.priceOrOdds - 1) : -order.stake;
        if (won) {
          // Credit stake back plus profit — the debit already happened at
          // place() time, so a winning order returns stake + pnl.
          await writeLedgerOptimistic(supabase, userId, (balance) => balance + order.stake + pnl);
        }

        const { book } = parseVenueOrderId(order.venueOrderId);
        const closingPriceOrOdds = book
          ? await closingOddsFor(supabase, parsed.fixtureId, parsed.market, parsed.outcome, book, fixture.kickoff_at, order.priceOrOdds)
          : order.priceOrOdds;

        settlements.push({
          venueOrderId: order.venueOrderId,
          outcome: won ? "won" : "lost",
          pnl,
          settledAt: Date.now(),
          closingPriceOrOdds,
        });
      }
      return settlements;
    },

    async balance() {
      const ledger = await getOrCreateLedger(supabase, userId);
      return { cash: ledger.balance, currency: "NGN" };
    },
  };
}
