import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { VenueAdapter, Intent, MarketRef, PlacedOrder, PlacedOrderStatus, Settlement, SettlementOutcome, ExecCtx } from "../core/venue";

/** Polymarket adapter, simulated fills (docs/alpha/02-market-landscape.md
 *  §4, docs/alpha/plans/phase-4-extra-venues.md) — Polymarket has no
 *  sandbox and this program never places a real order here (`mode:
 *  "paper"`, `id: "polymarket-sim"`). Reads are genuinely public and
 *  keyless: Gamma (`https://gamma-api.polymarket.com`) for market
 *  metadata/resolution, CLOB (`https://clob.polymarket.com`) for the live
 *  order book — no `getVenueSecret` call anywhere in this file.
 *
 *  MARKET ENCODING: `MarketRef.marketId` is Gamma's market `id`;
 *  `MarketRef.outcomeId` is that outcome's CLOB `token_id` (from Gamma's
 *  `clobTokenIds`, positionally paired with `outcomes`) — `listMarkets`
 *  emits one MarketRef per outcome per market, the same "one ref per
 *  outcome" convention as `zoqoSportsbook.ts`. `Intent.side` carries no
 *  betting information here — every accepted side means "buy this
 *  outcome's tokens" (mirrors sportsbook's and manifold's own "collapse
 *  onto the venue's real shape" notes), since a paper adapter with no real
 *  position bookkeeping beyond `alpha_orders` has no honest way to
 *  represent "short this outcome" separately from "buy the other one".
 *
 *  SIMULATED FILLS — "WALK THE BOOK": `place()` never sends a real order.
 *  It fetches the CLOB's live order book for the target outcome and
 *  consumes ASK liquidity level by level, cheapest price first, until
 *  `stake` dollars are spent or the book runs out, producing a
 *  volume-weighted average fill price — the standard simulated-fill
 *  approach named in 02-market-landscape.md §4/§5 and implemented by the
 *  reference project `agent-next/polymarket-paper-trader`. `walkOrderBook`
 *  below is this program's OWN implementation of that concept (not a port
 *  of their code), pure and unit-testable without the network. A book that
 *  can't fully fill `stake` returns `status: "partial"`, not "rejected" —
 *  per `core/venue.ts`'s `PlacedOrderStatus`, a partial fill is a real,
 *  valid outcome here; only a fully empty book is "rejected".
 *
 *  LEDGER: Polymarket-sim has no real wallet to read a balance from, so —
 *  per this task's brief — it reuses `alpha_ledger` exactly the way
 *  `zoqoSportsbook.ts` auto-provisions and optimistically debits/credits
 *  its NGN ledger row, just keyed `venue = "polymarket-sim"`, `currency =
 *  "USD"`, and a $1,000 starting paper balance (smaller than the
 *  sportsbook's ₦100,000 faucet since this is USD, not NGN). `alpha_ledger
 *  .venue` is a plain `text` column (docs/alpha/04-schema.md), not an enum,
 *  so a second venue value needs no schema change. `writeLedgerOptimistic`
 *  below is copied from `zoqoSportsbook.ts`'s function of the same name
 *  (same optimistic-concurrency pattern), not reinvented.
 *
 *  SETTLEMENT: Gamma's `outcomePrices` resolves to `["1","0"]`/`["0","1"]`
 *  (winner/loser) once a market is `closed` — verified live against the
 *  real Gamma API while building this adapter (see this task's report).
 *  Exact share count isn't persisted on `PlacedOrder` (no `shares` field —
 *  the same documented limitation as `manifold.ts`'s
 *  `estimateSettlementPnl`), so `settle()` recovers it the same way:
 *  `shares = stake / priceOrOdds`, using the VWAP fill price this adapter
 *  itself computed at `place()` time. */

type Client = SupabaseClient<Database>;

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";
const STARTING_BALANCE_USD = 1_000;
const MAX_RETRIES = 3;
const FETCH_TIMEOUT_MS = 8_000;
const WON_PRICE_THRESHOLD = 0.99;
const LOST_PRICE_THRESHOLD = 0.01;

interface GammaMarket {
  id: string;
  question?: string;
  active?: boolean;
  closed?: boolean;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
}

interface ClobBookLevel {
  price: string;
  size: string;
}

interface ClobBook {
  bids?: ClobBookLevel[];
  asks?: ClobBookLevel[];
}

/** Never throws — a Gamma/CLOB outage (or DNS block, in some sandboxed
 *  environments) degrades a single call to `null`, same convention as
 *  every other adapter's fetch helper (see manifold.ts's `fetchJson`).
 *  Public endpoints, so no auth header. Bounded by `FETCH_TIMEOUT_MS` so a
 *  stalled connection can't hang a caller — mirrors derivVirtual.ts's
 *  socket timeout for the same reason on a different transport. */
async function fetchJsonPublic<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Gamma's `outcomes`/`outcomePrices`/`clobTokenIds` fields are
 *  JSON-ENCODED STRINGS, not native arrays — parsed defensively since a
 *  malformed or absent field is a normal "can't use this market" state,
 *  not a bug. */
function parseJsonArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function marketOutcomeRefs(m: GammaMarket): MarketRef[] {
  return parseJsonArray(m.clobTokenIds).map((tokenId) => ({ venue: "polymarket-sim" as const, marketId: m.id, outcomeId: tokenId }));
}

async function fetchBook(tokenId: string): Promise<ClobBook | null> {
  return fetchJsonPublic<ClobBook>(`${CLOB_BASE}/book?token_id=${encodeURIComponent(tokenId)}`);
}

async function fetchGammaMarketById(marketId: string): Promise<GammaMarket | null> {
  return fetchJsonPublic<GammaMarket>(`${GAMMA_BASE}/markets/${encodeURIComponent(marketId)}`);
}

/** Best bid/ask off a raw CLOB book. Sorts defensively rather than trusting
 *  either array's given order — observed live, the CLOB returns `bids`
 *  ascending and `asks` descending by price, but that ordering isn't
 *  documented as a stable contract. */
function bestBidAsk(book: ClobBook): { bid: number | null; ask: number | null } {
  const bids = (book.bids ?? []).map((l) => Number(l.price)).filter(Number.isFinite);
  const asks = (book.asks ?? []).map((l) => Number(l.price)).filter(Number.isFinite);
  return {
    bid: bids.length ? Math.max(...bids) : null,
    ask: asks.length ? Math.min(...asks) : null,
  };
}

/** The book-walk simulated-fill algorithm (module header's SIMULATED FILLS
 *  note; concept cited from `agent-next/polymarket-paper-trader`, this is
 *  this program's own implementation). Pure and exported for unit testing
 *  without the network. `levels` must be passed BEST-PRICE-FIRST (ascending
 *  price for a buy walking asks) — this function consumes them in the
 *  order given and does not re-sort. Returns the shares filled, the USD
 *  cost, the volume-weighted average price, and any stake left over when
 *  the book runs out before `stakeUsd` is exhausted. */
export function walkOrderBook(
  levels: { price: number; size: number }[],
  stakeUsd: number,
): { filledShares: number; cost: number; avgPrice: number; remaining: number } {
  let remaining = stakeUsd;
  let filledShares = 0;
  let cost = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    if (!(level.price > 0) || !(level.size > 0)) continue;
    const levelCost = level.price * level.size;
    if (levelCost <= remaining) {
      filledShares += level.size;
      cost += levelCost;
      remaining -= levelCost;
    } else {
      const shares = remaining / level.price;
      filledShares += shares;
      cost += remaining;
      remaining = 0;
    }
  }
  const avgPrice = filledShares > 0 ? cost / filledShares : 0;
  return { filledShares, cost, avgPrice, remaining: Math.max(0, remaining) };
}

async function readLedger(supabase: Client, userId: string): Promise<{ balance: number; updated_at: string } | null> {
  const { data } = await supabase.from("alpha_ledger").select("balance, updated_at").eq("user_id", userId).eq("venue", "polymarket-sim").maybeSingle();
  return data;
}

/** Auto-provisions the $1,000 paper faucet on first reference — same
 *  "create on first use" convention as `zoqoSportsbook.ts`/`service.ts`'s
 *  `getOrCreateVenue`. */
async function getOrCreateLedger(supabase: Client, userId: string): Promise<{ balance: number; updated_at: string }> {
  const existing = await readLedger(supabase, userId);
  if (existing) return existing;
  const insertRow = { user_id: userId, venue: "polymarket-sim", currency: "USD", balance: STARTING_BALANCE_USD };
  const { data: inserted } = await supabase.from("alpha_ledger").insert(insertRow).select("balance, updated_at").single();
  return inserted ?? { balance: STARTING_BALANCE_USD, updated_at: new Date().toISOString() };
}

/** Optimistic-concurrency debit/credit against `alpha_ledger.balance`,
 *  keyed on `updated_at` — copied from `zoqoSportsbook.ts`'s function of
 *  the same name (that file's own header cites `terminalExecution.ts`'s
 *  `writeCashOptimistic` as the original pattern), not reinvented here. */
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
      .eq("venue", "polymarket-sim")
      .eq("updated_at", row.updated_at)
      .select("user_id");
    if (data && data.length > 0) return { ok: true, newBalance };
    // 0 rows affected — a concurrent writer changed updated_at first; retry.
  }
  return { ok: false, reason: "concurrent ledger write conflict, exhausted retries" };
}

export function createPolymarketSimAdapter(supabase: Client, userId: string): VenueAdapter {
  return {
    id: "polymarket-sim",
    mode: "paper",
    currency: "USD",

    async listMarkets({ query, limit }) {
      const lim = limit ?? 20;
      // Gamma's plain markets list + local substring filtering — the same
      // choice manifold.ts makes for its `category` filter (no
      // group-taxonomy lookup built), and simpler/more robust than parsing
      // `/public-search`'s nested events->markets response shape.
      const listUrl = `${GAMMA_BASE}/markets?active=true&closed=false&limit=${Math.min(lim * 4, 200)}`;
      const listed = (await fetchJsonPublic<GammaMarket[]>(listUrl)) ?? [];
      const needle = query?.toLowerCase();
      const filtered = needle ? listed.filter((m) => m.question?.toLowerCase().includes(needle)) : listed;
      return filtered.flatMap(marketOutcomeRefs).slice(0, lim);
    },

    async getQuote(m) {
      if (!m.outcomeId) return null;
      const book = await fetchBook(m.outcomeId);
      if (!book) return null;
      const { bid, ask } = bestBidAsk(book);
      if (bid == null && ask == null) return null;
      const mid = bid != null && ask != null ? (bid + ask) / 2 : (bid ?? ask ?? undefined);
      return { market: m, ts: Date.now(), bid: bid ?? undefined, ask: ask ?? undefined, last: mid, impliedProb: mid };
    },

    async place(intent: Intent, stake: number, ctx: ExecCtx): Promise<PlacedOrder> {
      const rejected = (): PlacedOrder => ({
        venueOrderId: "",
        market: intent.market,
        side: intent.side,
        stake,
        currency: "USD",
        priceOrOdds: 0,
        placedAt: ctx.now,
        status: "rejected",
      });
      const outcomeId = intent.market.outcomeId;
      if (!outcomeId || stake <= 0) return rejected();

      const book = await fetchBook(outcomeId);
      const asks = (book?.asks ?? [])
        .map((l) => ({ price: Number(l.price), size: Number(l.size) }))
        .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size))
        .sort((a, b) => a.price - b.price); // best (cheapest) ask first, regardless of the API's own ordering
      if (asks.length === 0) return rejected();

      const fill = walkOrderBook(asks, stake);
      if (fill.filledShares <= 0) return rejected();

      const debited = await writeLedgerOptimistic(supabase, userId, (balance) => balance - fill.cost);
      if (!debited.ok) return rejected();

      const status: PlacedOrderStatus = fill.remaining > 0.005 ? "partial" : "filled";
      return {
        venueOrderId: crypto.randomUUID(),
        market: intent.market,
        side: intent.side,
        stake: fill.cost,
        currency: "USD",
        priceOrOdds: fill.avgPrice,
        placedAt: ctx.now,
        status,
      };
    },

    // Same reasoning as manifold.ts/zoqoSportsbook.ts: alpha_orders is the
    // source of truth for "which orders Alpha placed" — settle.ts passes
    // the exact set into settle(open) below.
    async openOrders() {
      return [];
    },

    async settle(open: PlacedOrder[]): Promise<Settlement[]> {
      const settlements: Settlement[] = [];
      for (const order of open) {
        if (!order.venueOrderId || !order.market.outcomeId) continue;
        const market = await fetchGammaMarketById(order.market.marketId);
        if (!market || !market.closed) continue; // still open, leave out of the result

        const tokenIds = parseJsonArray(market.clobTokenIds);
        const prices = parseJsonArray(market.outcomePrices).map(Number);
        const idx = tokenIds.indexOf(order.market.outcomeId);
        if (idx === -1 || idx >= prices.length || !Number.isFinite(prices[idx])) {
          // Closed but this outcome's resolution can't be located — void
          // and refund rather than guess, or leave it stuck open forever.
          await writeLedgerOptimistic(supabase, userId, (balance) => balance + order.stake);
          settlements.push({ venueOrderId: order.venueOrderId, outcome: "void", pnl: 0, settledAt: Date.now() });
          continue;
        }

        const finalPrice = prices[idx];
        const shares = order.priceOrOdds > 0 ? order.stake / order.priceOrOdds : 0;
        let outcome: SettlementOutcome;
        let pnl: number;
        if (finalPrice >= WON_PRICE_THRESHOLD) {
          outcome = "won";
          pnl = shares * 1 - order.stake;
          await writeLedgerOptimistic(supabase, userId, (balance) => balance + order.stake + pnl);
        } else if (finalPrice <= LOST_PRICE_THRESHOLD) {
          outcome = "lost";
          pnl = -order.stake;
        } else {
          // Ambiguous resolution price (neither ~0 nor ~1) — refund rather
          // than guess a winner, the same honest fallback as the
          // "can't locate the outcome" branch above.
          outcome = "void";
          pnl = 0;
          await writeLedgerOptimistic(supabase, userId, (balance) => balance + order.stake);
        }

        settlements.push({ venueOrderId: order.venueOrderId, outcome, pnl, settledAt: Date.now(), closingPriceOrOdds: finalPrice });
      }
      return settlements;
    },

    async balance() {
      const ledger = await getOrCreateLedger(supabase, userId);
      return { cash: ledger.balance, currency: "USD" };
    },
  };
}
