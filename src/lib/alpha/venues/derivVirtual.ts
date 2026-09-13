import type { VenueAdapter, Intent, PlacedOrder, Settlement, SettlementOutcome, ExecCtx } from "../core/venue";
import { getVenueSecret } from "../secrets";

/** Deriv virtual-account adapter (docs/alpha/02-market-landscape.md §4,
 *  docs/alpha/plans/phase-4-extra-venues.md) — the first (and, in this
 *  program, only) WebSocket-based venue: every other adapter here is plain
 *  REST via `fetch`. Deriv's API (https://developers.deriv.com/) is one
 *  persistent WebSocket connection carrying request/response JSON messages
 *  keyed by a caller-assigned `req_id`, not one HTTP call per action — see
 *  `derivRequest()` below, the single piece of machinery every method on
 *  this adapter is a thin wrapper over. `id: "deriv-virtual"`, `mode:
 *  "demo"` (a real $10k *virtual* account token, not play money ZOQO itself
 *  synthesizes — see VenueMode's reasoning in core/venue.ts for why that's
 *  "demo" and not "paper").
 *
 *  SYNTHETIC INDICES: Deriv's `active_symbols` request returns every
 *  tradable instrument (forex, indices, commodities, synthetics); this
 *  adapter filters to `market === "synthetic_index"` — Deriv's always-on,
 *  24/7 Volatility/Boom/Crash/Jump indices, the exact instruments
 *  02-market-landscape.md §4 cites as the reason Deriv is on the venue list
 *  at all (no other free demo venue here trades outside market hours).
 *
 *  CONTRACT SHAPE: Deriv has no raw "buy N units at price P" order —
 *  `place()` buys a rise/fall ("CALL"/"PUT") contract for a fixed duration,
 *  sized by `stake` as the contract's stake (not a share/unit count the way
 *  Manifold or a price venue works). `Intent.side` maps long/buy/yes/back
 *  -> CALL (rise), everything else -> PUT (fall) — the same "collapse onto
 *  the venue's real two-outcome shape" pattern as manifold.ts's
 *  `intentSideToOutcome`, here named `intentSideToContractType`.
 *  DURATION LIMITATION (documented, not silently papered over): `Intent`
 *  carries no duration field, so every contract this adapter buys is fixed
 *  at `DEFAULT_DURATION_MIN` minutes — threading a strategy-chosen duration
 *  through `Intent.features` is a real refinement, out of scope here.
 *
 *  NEVER THROWS ACROSS THE VenueAdapter BOUNDARY: every method degrades to
 *  null/[]/a "rejected" PlacedOrder on a socket that fails to open, a
 *  request that times out (`REQUEST_TIMEOUT_MS`, 10s cap — no hung
 *  connections), a Deriv-side `error` response, or — notably — a runtime
 *  with no global `WebSocket` constructor at all. Node's global WebSocket
 *  is unflagged on Node 22+/Vercel's Node 24.x runtime (this task's
 *  brief), but this sandbox's local Node 20 only exposes it behind
 *  `--experimental-websocket`; `derivRequest()` checks
 *  `typeof WebSocket === "undefined"` up front so that gap degrades exactly
 *  like a network outage instead of throwing an unhandled ReferenceError. */

const APP_ID = process.env.DERIV_APP_ID || "1089"; // Deriv's own docs/examples use 1089 as a public demo app_id
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_DURATION_MIN = 5;

interface DerivEnvelope {
  req_id?: number;
  error?: { code?: string; message?: string };
  [key: string]: unknown;
}

interface ActiveSymbol {
  symbol: string;
  display_name: string;
  market: string;
}
interface ActiveSymbolsResponse extends DerivEnvelope {
  active_symbols?: ActiveSymbol[];
}
interface TicksHistoryResponse extends DerivEnvelope {
  history?: { prices: number[]; times: number[] };
}
interface ProposalResponse extends DerivEnvelope {
  proposal?: { id: string; ask_price: number; spot?: number };
}
interface BuyResponse extends DerivEnvelope {
  buy?: { contract_id: number; buy_price: number; longcode?: string };
}
interface ProposalOpenContractResponse extends DerivEnvelope {
  proposal_open_contract?: { contract_id: number; is_sold: 0 | 1; profit?: number; sell_price?: number };
}
interface BalanceResponse extends DerivEnvelope {
  balance?: { balance: number; currency: string };
}

/** Maps ZOQO's generic IntentSide union onto Deriv's rise/fall contract
 *  types — same "collapse onto the venue's two-outcome shape" pattern as
 *  manifold.ts's `intentSideToOutcome`. */
export function intentSideToContractType(side: Intent["side"] | PlacedOrder["side"]): "CALL" | "PUT" {
  return side === "sell" || side === "short" || side === "lay" || side === "no" ? "PUT" : "CALL";
}

/** The one piece of WebSocket request/response machinery every method below
 *  calls through — never duplicated per method, per this module's own
 *  brief. Opens a fresh connection per call (Deriv's API has no documented
 *  keep-alive contract this codebase can rely on across serverless
 *  invocations, so a short-lived connection per request is the honest
 *  choice — the same per-call tradeoff `manifold.ts`/`zoqoTerminal.ts` make
 *  with a fresh `fetch` each time). If `token` is given, authorizes first
 *  and only sends `request` once authorization succeeds; a failed
 *  authorize resolves `null` rather than attempting the request
 *  unauthenticated. Resolves (never rejects) `null` on any failure —
 *  timeout, socket error, Deriv-side `error` field, malformed JSON, or no
 *  global WebSocket at all — so a caller can `await` this without a
 *  try/catch. */
function derivRequest<T extends DerivEnvelope>(request: Record<string, unknown>, token: string | null): Promise<T | null> {
  return new Promise((resolve) => {
    if (typeof WebSocket === "undefined") {
      resolve(null); // no global WebSocket in this runtime — degrade like an outage, don't throw
      return;
    }

    let settled = false;
    let ws: WebSocket | null = null;
    const AUTH_REQ_ID = 1;
    const MAIN_REQ_ID = 2;

    const finish = (result: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // already closed/closing — nothing to do
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), REQUEST_TIMEOUT_MS);

    try {
      ws = new WebSocket(WS_URL);
    } catch {
      finish(null);
      return;
    }

    ws.onopen = () => {
      try {
        if (token) {
          ws!.send(JSON.stringify({ authorize: token, req_id: AUTH_REQ_ID }));
        } else {
          ws!.send(JSON.stringify({ ...request, req_id: MAIN_REQ_ID }));
        }
      } catch {
        finish(null);
      }
    };

    ws.onmessage = (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : "";
        const data = JSON.parse(raw) as DerivEnvelope;
        if (token && data.req_id === AUTH_REQ_ID) {
          if (data.error) {
            finish(null);
            return;
          }
          try {
            ws!.send(JSON.stringify({ ...request, req_id: MAIN_REQ_ID }));
          } catch {
            finish(null);
          }
          return;
        }
        if (data.req_id === MAIN_REQ_ID) {
          if (data.error) {
            finish(null);
            return;
          }
          finish(data as T);
        }
      } catch {
        finish(null);
      }
    };

    ws.onerror = () => finish(null);
    ws.onclose = () => finish(null);
  });
}

export function createDerivVirtualAdapter(token: string | null): VenueAdapter {
  return {
    id: "deriv-virtual",
    mode: "demo",
    currency: "USD",

    async listMarkets({ query, limit }) {
      const lim = limit ?? 20;
      const res = await derivRequest<ActiveSymbolsResponse>({ active_symbols: "brief", product_type: "basic" }, token);
      const all = res?.active_symbols ?? [];
      const synthetics = all.filter((s) => s.market === "synthetic_index");
      const needle = query?.toLowerCase();
      const filtered = needle
        ? synthetics.filter((s) => s.display_name.toLowerCase().includes(needle) || s.symbol.toLowerCase().includes(needle))
        : synthetics;
      return filtered.slice(0, lim).map((s) => ({ venue: "deriv-virtual" as const, marketId: s.symbol }));
    },

    async getQuote(m) {
      // `ticks_history` with `count: 1`/`end: "latest"` is a one-shot
      // request/response; Deriv's plain `ticks` request instead SUBSCRIBES
      // to a live stream (multiple messages over time), which doesn't fit
      // this adapter's single request/response contract — see
      // derivRequest's header.
      const res = await derivRequest<TicksHistoryResponse>({ ticks_history: m.marketId, end: "latest", count: 1, style: "ticks" }, token);
      const prices = res?.history?.prices;
      const price = prices && prices.length > 0 ? prices[prices.length - 1] : undefined;
      if (price == null || !Number.isFinite(price)) return null;
      return { market: m, ts: Date.now(), last: price };
    },

    async place(intent: Intent, stake: number, ctx: ExecCtx): Promise<PlacedOrder> {
      const rejected = (priceOrOdds: number): PlacedOrder => ({
        venueOrderId: "",
        market: intent.market,
        side: intent.side,
        stake,
        currency: "USD",
        priceOrOdds,
        placedAt: ctx.now,
        status: "rejected",
      });
      if (!token) return rejected(0); // no virtual-account token — same "no key, no trade" convention as every other adapter

      const contractType = intentSideToContractType(intent.side);
      const proposalRes = await derivRequest<ProposalResponse>(
        {
          proposal: 1,
          amount: stake,
          basis: "stake",
          contract_type: contractType,
          currency: "USD",
          duration: DEFAULT_DURATION_MIN,
          duration_unit: "m",
          symbol: intent.market.marketId,
        },
        token,
      );
      const proposal = proposalRes?.proposal;
      if (!proposal?.id) return rejected(0);

      const buyRes = await derivRequest<BuyResponse>({ buy: proposal.id, price: stake }, token);
      const buy = buyRes?.buy;
      if (!buy?.contract_id) return rejected(proposal.ask_price ?? 0);

      return {
        venueOrderId: String(buy.contract_id),
        market: intent.market,
        side: intent.side,
        stake,
        currency: "USD",
        priceOrOdds: buy.buy_price ?? proposal.ask_price ?? 0,
        placedAt: ctx.now,
        status: "filled",
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
        if (!order.venueOrderId) continue;
        const contractId = Number(order.venueOrderId);
        if (!Number.isFinite(contractId)) continue;
        const res = await derivRequest<ProposalOpenContractResponse>({ proposal_open_contract: 1, contract_id: contractId }, token);
        const contract = res?.proposal_open_contract;
        if (!contract || contract.is_sold !== 1) continue; // still open, leave out of the result

        const profit = contract.profit ?? (contract.sell_price != null ? contract.sell_price - order.stake : -order.stake);
        const outcome: SettlementOutcome = profit >= 0 ? "won" : "lost";
        settlements.push({
          venueOrderId: order.venueOrderId,
          outcome,
          pnl: profit,
          settledAt: Date.now(),
          closingPriceOrOdds: contract.sell_price,
        });
      }
      return settlements;
    },

    async balance() {
      if (!token) return { cash: 0, currency: "USD" };
      const res = await derivRequest<BalanceResponse>({ balance: 1 }, token);
      return { cash: res?.balance?.balance ?? 0, currency: "USD" };
    },
  };
}

/** venues/index.ts's `createVenueAdapter` is synchronous (manifold.ts's
 *  `createManifoldAdapterForUser` header explains why) — fetching the
 *  virtual-account token needs an async secrets lookup, so this factory
 *  resolves it lazily on first use, exactly like that function, and is
 *  memoized per instance so repeated calls in the same run don't re-hit
 *  the secret lookup. */
export function createDerivVirtualAdapterForUser(userId: string): VenueAdapter {
  let innerPromise: Promise<VenueAdapter> | null = null;
  function inner(): Promise<VenueAdapter> {
    if (!innerPromise) {
      innerPromise = getVenueSecret(userId, "deriv-virtual").then((token) => createDerivVirtualAdapter(token));
    }
    return innerPromise;
  }

  return {
    id: "deriv-virtual",
    mode: "demo",
    currency: "USD",
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
