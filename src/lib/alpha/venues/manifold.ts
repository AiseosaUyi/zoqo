import type { VenueAdapter, Intent, MarketRef, PlacedOrder, Settlement, SettlementOutcome, ExecCtx } from "../core/venue";
import { getVenueSecret } from "../secrets";

/** Manifold Markets adapter (docs/alpha/02-market-landscape.md §4,
 *  docs/alpha/plans/phase-2-manifold.md) — ZOQO Alpha's first venue outside
 *  this codebase. Manifold is real play-money (mana), so `mode: "paper"`
 *  is the right fit per the VenueMode reasoning in core/venue.ts (nothing
 *  here is ever "demo" data — it's a real API, real other users, real
 *  resolution — it just isn't real-money). Plain REST via global `fetch`,
 *  no SDK, per this phase's "no new npm dependencies" constraint.
 *
 *  Manifold markets are PROBABILITY-denominated, not price-denominated: a
 *  binary market's `probability` field (0..1) is simultaneously this
 *  adapter's `Quote.last` and `Quote.impliedProb` — there is no separate
 *  "price" concept the way a CFMM price differs from an implied prob on a
 *  price venue. There's also no literal bid/ask spread the way an order
 *  book has one; the CFMM's `probability` is the single clearing price for
 *  both YES and NO at that instant (see marketFeatures.ts for the spread
 *  approximation used instead). */

const BASE = "https://api.manifold.markets";

interface ManifoldLiteMarket {
  id: string;
  question: string;
  probability?: number;
  closeTime?: number;
  volume?: number;
  volume24Hours?: number;
  isResolved?: boolean;
  resolution?: string;
  resolutionProbability?: number;
  totalLiquidity?: number;
  pool?: Record<string, number>;
  /** Manifold's LiteMarket type carries recent probability deltas for
   *  CPMM-1 binary markets under this field; treated as optional/untyped
   *  here since its presence/shape can vary by market mechanism (e.g. it
   *  won't exist on a multi-choice or resolved market) — marketFeatures.ts
   *  reads it defensively rather than assuming it's always there. */
  probChanges?: { day?: number; week?: number; month?: number };
}

type ManifoldResolution = "YES" | "NO" | "MKT" | "CANCEL";

interface ManifoldBetResponse {
  id?: string;
  probBefore?: number;
  probAfter?: number;
}

interface ManifoldMe {
  balance?: number;
}

function authHeaders(apiKey: string | null, withContentType: boolean): HeadersInit {
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Key ${apiKey}`;
  if (withContentType) headers["Content-Type"] = "application/json";
  return headers;
}

/** Never throws — every caller in this adapter treats a failed fetch as
 *  "no data" (null), not an exception, so a Manifold outage degrades a
 *  single evaluate()/settle() pass rather than crashing the runner. */
async function fetchJson<T>(url: string, apiKey: string | null): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: authHeaders(apiKey, false) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function marketToRef(m: ManifoldLiteMarket): MarketRef {
  return { venue: "manifold", marketId: m.id };
}

/** Maps ZOQO's generic IntentSide union onto Manifold's two-outcome
 *  YES/NO shape. Manifold has no notion of "short" or "lay" beyond betting
 *  the opposite outcome, so every "affirmative" side (buy/long/back/yes)
 *  becomes YES and everything else (sell/short/lay/no) becomes NO. */
export function intentSideToOutcome(side: Intent["side"] | PlacedOrder["side"]): "YES" | "NO" {
  return side === "sell" || side === "short" || side === "lay" || side === "no" ? "NO" : "YES";
}

/** Pure resolution -> pnl estimate, factored out so it's unit-testable
 *  without the network (see __tests__/manifold.test.ts).
 *
 *  LIMITATION (documented, not silently papered over): Manifold pays out
 *  per-SHARE, and this adapter's `place()` doesn't capture the `shares`
 *  Manifold's bet response returns (PlacedOrder has no shares field either
 *  — that's a schema change out of scope for Phase 2). Instead this
 *  approximates shares as `stake / priceOrOddsAtEntry` (the probability of
 *  the bet's side at entry, ignoring the CFMM's within-trade slippage
 *  curve) and pays $1/share on a correct YES/NO resolution, a
 *  probability-weighted partial payout on MKT, and a full refund (pnl 0)
 *  on CANCEL. Exact share-based P&L is a good Phase 4 refinement. */
export function estimateSettlementPnl(params: {
  side: "YES" | "NO";
  stake: number;
  priceOrOddsAtEntry: number;
  resolution: ManifoldResolution;
  resolutionProbability?: number | null;
}): number {
  const { side, stake, resolution, resolutionProbability } = params;
  const entryProb = Math.min(0.99, Math.max(0.01, params.priceOrOddsAtEntry || 0.5));
  const approxShares = stake / entryProb;

  if (resolution === "CANCEL") return 0; // Manifold fully refunds cancelled markets.

  if (resolution === "MKT") {
    const finalProb = resolutionProbability ?? 0.5;
    const payoutProb = side === "YES" ? finalProb : 1 - finalProb;
    return approxShares * payoutProb - stake;
  }

  const won = resolution === side;
  if (!won) return -stake;
  return approxShares * 1 - stake; // $1/share payout on a correct resolution
}

export function createManifoldAdapter(apiKey: string | null): VenueAdapter {
  return {
    id: "manifold",
    mode: "paper",
    currency: "MANA",

    async listMarkets({ query, category, limit }) {
      const lim = limit ?? 20;
      if (query) {
        // Manifold's dedicated full-text search endpoint. If it's ever
        // unavailable (rate limit, API shape drift), fall back to the
        // plain listing + client-side substring match rather than
        // returning nothing.
        const searchUrl = `${BASE}/v0/search-markets?term=${encodeURIComponent(query)}&limit=${lim}`;
        const searched = await fetchJson<ManifoldLiteMarket[]>(searchUrl, apiKey);
        if (searched) return searched.slice(0, lim).map(marketToRef);
      }
      const listUrl = `${BASE}/v0/markets?limit=${Math.min(lim * 4, 500)}`;
      const listed = (await fetchJson<ManifoldLiteMarket[]>(listUrl, apiKey)) ?? [];
      const needle = query?.toLowerCase();
      const categoryNeedle = category?.toLowerCase();
      const filtered = listed.filter((m) => {
        const q = m.question?.toLowerCase() ?? "";
        if (needle && !q.includes(needle)) return false;
        // Manifold's group/category taxonomy needs a separate group-id
        // lookup to query precisely; a soft substring match against the
        // question is the honest thing to do without that lookup built.
        if (categoryNeedle && !q.includes(categoryNeedle)) return false;
        return true;
      });
      return filtered.slice(0, lim).map(marketToRef);
    },

    async getQuote(m) {
      const market = await fetchJson<ManifoldLiteMarket>(`${BASE}/v0/market/${m.marketId}`, apiKey);
      if (!market || typeof market.probability !== "number") return null;
      return {
        market: m,
        ts: Date.now(),
        // Probability IS the price on Manifold — see module header.
        last: market.probability,
        impliedProb: market.probability,
      };
    },

    async place(intent: Intent, stake: number, ctx: ExecCtx): Promise<PlacedOrder> {
      const outcome = intentSideToOutcome(intent.side);
      try {
        const res = await fetch(`${BASE}/v0/bet`, {
          method: "POST",
          headers: authHeaders(apiKey, true),
          body: JSON.stringify({ contractId: intent.market.marketId, amount: stake, outcome }),
        });
        if (!res.ok) {
          // A non-2xx here is typically something informative (insufficient
          // balance, market closed) rather than a bug in this adapter —
          // mirrors zoqoTerminal.ts's place(): return "rejected" instead of
          // throwing, so the runner records a clean rejection rather than
          // an "evaluate() threw" error.
          return {
            venueOrderId: "",
            market: intent.market,
            side: intent.side,
            stake,
            currency: "MANA",
            priceOrOdds: 0,
            placedAt: ctx.now,
            status: "rejected",
          };
        }
        const bet = (await res.json()) as ManifoldBetResponse;
        const probAtEntry = bet.probAfter ?? bet.probBefore ?? 0.5;
        return {
          venueOrderId: bet.id ? String(bet.id) : "",
          market: intent.market,
          side: intent.side,
          stake,
          currency: "MANA",
          // Store the probability of THIS bet's side at entry (not always
          // the raw market probability) — settle() needs it to approximate
          // shares purchased. See intentSideToOutcome for the YES/NO split.
          priceOrOdds: outcome === "YES" ? probAtEntry : 1 - probAtEntry,
          placedAt: ctx.now,
          status: bet.id ? "filled" : "rejected",
        };
      } catch {
        return {
          venueOrderId: "",
          market: intent.market,
          side: intent.side,
          stake,
          currency: "MANA",
          priceOrOdds: 0,
          placedAt: ctx.now,
          status: "rejected",
        };
      }
    },

    // Same reasoning as zoqoTerminal.ts: this adapter is stateless per call
    // (no persisted "which bets are mine" index beyond what a Manifold user
    // id + GET /v0/bets?userId= would give, and this factory isn't handed
    // one). `alpha_orders` is this program's own bookkeeping of what it
    // placed, and settle.ts passes that exact set into settle(open) below —
    // that's the source of truth, not a re-derived list from Manifold.
    async openOrders() {
      return [];
    },

    async settle(open: PlacedOrder[]): Promise<Settlement[]> {
      const settlements: Settlement[] = [];
      for (const order of open) {
        if (!order.venueOrderId) continue;
        const market = await fetchJson<ManifoldLiteMarket>(`${BASE}/v0/market/${order.market.marketId}`, apiKey);
        if (!market || !market.isResolved || !market.resolution) continue; // still open, leave out of the result

        const side = intentSideToOutcome(order.side);
        const resolution = market.resolution as ManifoldResolution;
        const pnl = estimateSettlementPnl({
          side,
          stake: order.stake,
          priceOrOddsAtEntry: order.priceOrOdds,
          resolution,
          resolutionProbability: market.resolutionProbability ?? null,
        });
        const outcome: SettlementOutcome = resolution === "CANCEL" ? "void" : pnl >= 0 ? "won" : "lost";

        settlements.push({
          venueOrderId: order.venueOrderId,
          outcome,
          pnl,
          settledAt: Date.now(),
          closingPriceOrOdds: market.resolutionProbability,
        });
      }
      return settlements;
    },

    async balance() {
      if (!apiKey) return { cash: 0, currency: "MANA" };
      const me = await fetchJson<ManifoldMe>(`${BASE}/v0/me`, apiKey);
      return { cash: me?.balance ?? 0, currency: "MANA" };
    },
  };
}

/** venues/index.ts's `createVenueAdapter` is synchronous (see that file's
 *  header for why: 3 existing callers — runner.ts, settle.ts, and the
 *  already-built src/lib/mcp/alphaTools.ts, which this phase must not
 *  touch — all call it without awaiting). Fetching the API key needs an
 *  async secrets lookup, so rather than making createVenueAdapter async
 *  (and updating every caller, including the off-limits one), this factory
 *  resolves the key lazily on first use: every VenueAdapter method is
 *  already async, so awaiting the secret inside each one costs nothing at
 *  the call site. The resolved inner adapter is memoized per instance so
 *  repeated calls in the same run don't re-hit the secret lookup. */
export function createManifoldAdapterForUser(userId: string): VenueAdapter {
  let innerPromise: Promise<VenueAdapter> | null = null;
  function inner(): Promise<VenueAdapter> {
    if (!innerPromise) {
      innerPromise = getVenueSecret(userId, "manifold").then((apiKey) => createManifoldAdapter(apiKey));
    }
    return innerPromise;
  }

  return {
    id: "manifold",
    mode: "paper",
    currency: "MANA",
    async listMarkets(q) {
      return (await inner()).listMarkets(q);
    },
    async getQuote(m) {
      return (await inner()).getQuote(m);
    },
    async place(intent, stake, ctx) {
      return (await inner()).place(intent, stake, ctx);
    },
    async openOrders() {
      return (await inner()).openOrders();
    },
    async settle(open) {
      return (await inner()).settle(open);
    },
    async balance() {
      return (await inner()).balance();
    },
  };
}
