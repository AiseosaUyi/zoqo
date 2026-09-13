import { createHmac } from "crypto";
import type { VenueAdapter, Intent, MarketRef, PlacedOrder, Settlement, ExecCtx } from "../core/venue";
import { getVenueSecret } from "../secrets";

/** Bybit v5 demo trading adapter (docs/alpha/02-market-landscape.md §4,
 *  docs/alpha/plans/phase-4-extra-venues.md). `api-demo.bybit.com` mirrors
 *  the real v5 REST API 1:1 against a demo-funded account (funded once via
 *  `/v5/account/demo-apply-money`, up to 100k USDT — a human/manual step,
 *  see `balance()`'s note below; this adapter never calls that endpoint
 *  itself). `id: "bybit-demo"`, `mode: "demo"`, `currency: "USDT"`.
 *
 *  MARKET CHOICE: spot, not linear perps. Bybit v5's `category` param
 *  splits `spot` / `linear` / `inverse` / `option` across every endpoint
 *  used here. Spot is picked "for simplicity" per this phase's own build
 *  prompt: no leverage/margin bookkeeping, no funding-rate accrual, and
 *  `listMarkets`/`getQuote` are simple public (unauthenticated) endpoints
 *  either way. The tradeoff is documented on `settle()` below, where spot's
 *  lack of a first-class "position" object (the way linear/inverse have
 *  `/v5/position/list`) makes "was this closed by its own stop/take-profit"
 *  a heuristic rather than a direct lookup.
 *
 *  AUTH (Bybit v5, documented at
 *  https://bybit-exchange.github.io/docs/v5/guide#authentication —
 *  well-established, not a from-memory reconstruction the way Kalshi's
 *  RSA-PSS scheme in kalshiDemo.ts is): HMAC-SHA256 over
 *  `timestamp + apiKey + recvWindow + queryStringOrBody`, sent as headers
 *  `X-BAPI-API-KEY`, `X-BAPI-TIMESTAMP`, `X-BAPI-RECV-WINDOW`,
 *  `X-BAPI-SIGN` (hex digest), `X-BAPI-SIGN-TYPE: "2"`. Public endpoints
 *  (`listMarkets`, `getQuote` — market data, no account context) need none
 *  of this; only `place`, `settle`, and `balance` sign.
 *
 *  CREDENTIAL SHAPE: v5 HMAC auth needs an API key AND an API secret — two
 *  parts — but `secrets.ts`'s `getVenueSecret()` returns one string (see
 *  that file's header). Per this phase's own instructions, the choice was
 *  between (a) extending `getVenueSecret` with a `getVenueSecretPair`, or
 *  (b) encoding both parts in one env var and splitting on `:`. This
 *  adapter takes (b) — **less invasive**: it changes zero lines of
 *  `secrets.ts`, adds no new function to a shared contract other adapters
 *  would need to know exists or not, and keeps the "one string per venue"
 *  invariant `secrets.ts`'s env-var fallback already assumes. The raw
 *  `BYBIT_DEMO_API_KEY` value (via secrets.ts's default
 *  `${VENUE}_API_KEY` derivation for "bybit-demo") is expected to encode
 *  `"<apiKey>:<apiSecret>"`, split on the first `:` (Bybit API keys/secrets
 *  are plain alphanumeric strings with no `:`, so this is unambiguous).
 *  `kalshiDemo.ts` makes the identical "less invasive" call for its own
 *  two-part RSA credential, for the same reason. */

const BASE = "https://api-demo.bybit.com";
const CATEGORY = "spot";
const RECV_WINDOW = "5000";

interface BybitCredential {
  apiKey: string;
  apiSecret: string;
}

function parseCredential(raw: string | null): BybitCredential | null {
  if (!raw) return null;
  const idx = raw.indexOf(":");
  if (idx <= 0 || idx === raw.length - 1) return null;
  const apiKey = raw.slice(0, idx).trim();
  const apiSecret = raw.slice(idx + 1).trim();
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

function sign(secret: string, timestamp: string, apiKey: string, payload: string): string {
  return createHmac("sha256", secret).update(`${timestamp}${apiKey}${RECV_WINDOW}${payload}`).digest("hex");
}

/** Bybit v5 doesn't require alphabetically-sorted query params, but the
 *  exact string built here must be byte-identical between the signed
 *  payload and the actual request URL — sorting keys just makes that
 *  trivially true regardless of call-site param order. */
function buildQuery(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string | number] => e[1] !== undefined);
  entries.sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}

function authHeaders(cred: BybitCredential, timestamp: string, signature: string): HeadersInit {
  return {
    "X-BAPI-API-KEY": cred.apiKey,
    "X-BAPI-TIMESTAMP": timestamp,
    "X-BAPI-RECV-WINDOW": RECV_WINDOW,
    "X-BAPI-SIGN": signature,
    "X-BAPI-SIGN-TYPE": "2",
    "Content-Type": "application/json",
  };
}

/** Never throws — a failed/blocked/malformed response degrades to `null`.
 *  `signed` is false for the two public market-data endpoints this adapter
 *  calls; everything else needs a credential and returns `null` outright
 *  when one isn't available (mirrors kalshiDemo.ts: missing/invalid
 *  credential -> no request attempted, or request goes out unauthenticated
 *  and Bybit answers with an auth error, either way "no data"). */
async function bybitFetch<T>(
  cred: BybitCredential | null,
  method: "GET" | "POST",
  path: string,
  opts: { query?: Record<string, string | number | undefined>; body?: Record<string, unknown>; signed: boolean },
): Promise<T | null> {
  try {
    const query = opts.query ? buildQuery(opts.query) : "";
    const bodyStr = opts.body ? JSON.stringify(opts.body) : "";
    const url = `${BASE}${path}${query ? `?${query}` : ""}`;

    let headers: HeadersInit = { "Content-Type": "application/json" };
    if (opts.signed) {
      if (!cred) return null;
      const timestamp = String(Date.now());
      const payload = method === "GET" ? query : bodyStr;
      const signature = sign(cred.apiSecret, timestamp, cred.apiKey, payload);
      headers = authHeaders(cred, timestamp, signature);
    }

    const res = await fetch(url, { method, headers, body: method === "POST" ? bodyStr : undefined });
    if (!res.ok) return null;
    const json = (await res.json()) as { retCode?: number; result?: T };
    if (typeof json.retCode === "number" && json.retCode !== 0) return null; // Bybit's own app-level error code
    return json.result ?? null;
  } catch {
    return null;
  }
}

interface BybitInstrument {
  symbol: string;
  status?: string; // "Trading" | ...
}
interface BybitInstrumentsResult {
  list?: BybitInstrument[];
}

interface BybitTicker {
  symbol: string;
  bid1Price?: string;
  ask1Price?: string;
  lastPrice?: string;
}
interface BybitTickersResult {
  list?: BybitTicker[];
}

interface BybitOrderResult {
  orderId?: string;
}

interface BybitOrderHistoryEntry {
  orderId: string;
  symbol: string;
  side: "Buy" | "Sell";
  orderStatus: string; // "Filled" | "Cancelled" | "New" | ...
  createdTime: string; // ms since epoch, as a string
  cumExecValue?: string;
  cumExecQty?: string;
}
interface BybitOrderHistoryResult {
  list?: BybitOrderHistoryEntry[];
}

interface BybitWalletBalanceResult {
  list?: { coin?: { coin: string; walletBalance: string }[] }[];
}

function marketToRef(symbol: string): MarketRef {
  return { venue: "bybit-demo", marketId: symbol };
}

/** Maps ZOQO's generic IntentSide union onto Bybit's Buy/Sell shape.
 *  Affirmative sides (buy/long/back/yes) -> "Buy"; everything else
 *  (sell/short/lay/no) -> "Sell" — same collapsing convention as
 *  manifold.ts's `intentSideToOutcome`, cited there as the pattern this
 *  follows, adapted to a two-sided spot market instead of a two-outcome
 *  contract. */
export function intentSideToBybitSide(side: Intent["side"] | PlacedOrder["side"]): "Buy" | "Sell" {
  return side === "sell" || side === "short" || side === "lay" || side === "no" ? "Sell" : "Buy";
}

export function createBybitDemoAdapter(rawSecret: string | null): VenueAdapter {
  const cred = parseCredential(rawSecret);

  return {
    id: "bybit-demo",
    mode: "demo",
    currency: "USDT",

    async listMarkets({ query, limit }) {
      const res = await bybitFetch<BybitInstrumentsResult>(cred, "GET", "/v5/market/instruments-info", { query: { category: CATEGORY, limit: 200 }, signed: false });
      const instruments = (res?.list ?? []).filter((i) => i.status === "Trading");
      const needle = query?.toLowerCase();
      const filtered = needle ? instruments.filter((i) => i.symbol.toLowerCase().includes(needle)) : instruments;
      return filtered.slice(0, limit ?? 20).map((i) => marketToRef(i.symbol));
    },

    async getQuote(m) {
      const res = await bybitFetch<BybitTickersResult>(cred, "GET", "/v5/market/tickers", { query: { category: CATEGORY, symbol: m.marketId }, signed: false });
      const ticker = res?.list?.[0];
      if (!ticker) return null;
      const bid = ticker.bid1Price ? Number(ticker.bid1Price) : undefined;
      const ask = ticker.ask1Price ? Number(ticker.ask1Price) : undefined;
      const last = ticker.lastPrice ? Number(ticker.lastPrice) : undefined;
      return { market: m, ts: Date.now(), bid, ask, last };
    },

    async place(intent: Intent, stake: number, ctx: ExecCtx): Promise<PlacedOrder> {
      const rejected = (priceOrOdds: number): PlacedOrder => ({
        venueOrderId: "",
        market: intent.market,
        side: intent.side,
        stake,
        currency: "USDT",
        priceOrOdds,
        placedAt: ctx.now,
        status: "rejected",
      });
      if (!cred) return rejected(0);

      const side = intentSideToBybitSide(intent.side);
      const quote = await bybitFetch<BybitTickersResult>(cred, "GET", "/v5/market/tickers", { query: { category: CATEGORY, symbol: intent.market.marketId }, signed: false });
      const lastPrice = Number(quote?.list?.[0]?.lastPrice ?? 0);
      if (!(lastPrice > 0)) return rejected(0);

      const qty = (stake / lastPrice).toFixed(6);
      const body: Record<string, unknown> = { category: CATEGORY, symbol: intent.market.marketId, side, orderType: "Market", qty };
      // Standard v5 order-create params. Documented as available on spot as
      // well as linear/inverse in Bybit's v5 reference; if the demo venue
      // silently ignores them for a spot market order, that's a no-op, not
      // a broken request — settle() below treats "no evidence of a TP/SL
      // close" as "still open" either way, never fabricating a close.
      if (typeof intent.takeProfit === "number") body.takeProfit = String(intent.takeProfit);
      if (typeof intent.stopLoss === "number") body.stopLoss = String(intent.stopLoss);

      const res = await bybitFetch<BybitOrderResult>(cred, "POST", "/v5/order/create", { body, signed: true });
      if (!res?.orderId) return rejected(lastPrice);

      return {
        venueOrderId: res.orderId,
        market: intent.market,
        side: intent.side,
        stake,
        currency: "USDT",
        priceOrOdds: lastPrice,
        placedAt: ctx.now,
        // v5's order-create response carries only the order id, not a fill
        // confirmation — a market order is assumed filled immediately, same
        // "accepted == filled" convention zoqoTerminal.ts uses for its own
        // immediate-fill path.
        status: "filled",
      };
    },

    // Same reasoning as every other adapter here: alpha_orders is the
    // source of truth for "which orders Alpha placed".
    async openOrders() {
      return [];
    },

    async settle(open: PlacedOrder[]): Promise<Settlement[]> {
      if (!cred) return [];
      const settlements: Settlement[] = [];
      for (const order of open) {
        if (!order.venueOrderId) continue;

        // SPOT SETTLEMENT LIMITATION (documented, not silently guessed):
        // Bybit v5 spot has no `/v5/position/list`-equivalent "this holding
        // was closed, here's the realized pnl" record the way linear/
        // inverse perps do. The closest honest signal available is: look
        // for a later, opposite-side, Filled order on the same symbol in
        // this account's order history, and treat ITS average price as the
        // close. This is a heuristic (it can't distinguish "the strategy's
        // own future close order" from "a human manually sold the same
        // symbol from /terminal" or another strategy's independent trade on
        // the same symbol) — exactly the kind of gap zoqoTerminal.ts's own
        // settle() documents for its shared-wallet reconciliation, not a
        // bug unique to this file. When no such order is found, this
        // strategy's position is reported as still open — "leave out,
        // don't fabricate", the same convention every settle() in this
        // directory follows.
        const entrySide = intentSideToBybitSide(order.side);
        const closingSide: "Buy" | "Sell" = entrySide === "Buy" ? "Sell" : "Buy";
        const history = await bybitFetch<BybitOrderHistoryResult>(cred, "GET", "/v5/order/history", {
          query: { category: CATEGORY, symbol: order.market.marketId, limit: 50 },
          signed: true,
        });
        const entryOrder = history?.list?.find((o) => o.orderId === order.venueOrderId);
        const entryTime = entryOrder ? Number(entryOrder.createdTime) : order.placedAt;

        const closeOrder = (history?.list ?? [])
          .filter((o) => o.side === closingSide && o.orderStatus === "Filled" && Number(o.createdTime) > entryTime)
          .sort((a, b) => Number(a.createdTime) - Number(b.createdTime))[0];
        if (!closeOrder) continue; // no evidence of a close yet — still open

        const execQty = Number(closeOrder.cumExecQty ?? 0);
        const execValue = Number(closeOrder.cumExecValue ?? 0);
        if (!(execQty > 0)) continue;
        const closePrice = execValue / execQty;

        const qty = order.stake / order.priceOrOdds;
        const pnl = entrySide === "Buy" ? qty * (closePrice - order.priceOrOdds) : qty * (order.priceOrOdds - closePrice);

        settlements.push({
          venueOrderId: order.venueOrderId,
          outcome: pnl >= 0 ? "won" : "lost",
          pnl,
          settledAt: Date.now(),
          closingPriceOrOdds: closePrice,
        });
      }
      return settlements;
    },

    async balance() {
      if (!cred) return { cash: 0, currency: "USDT" };
      // Demo funding itself (`/v5/account/demo-apply-money`, up to 100k
      // USDT per docs/alpha/02-market-landscape.md §4) is a one-time,
      // human-initiated top-up — this adapter reads the balance, it never
      // calls that endpoint to mint demo funds on its own.
      const res = await bybitFetch<BybitWalletBalanceResult>(cred, "GET", "/v5/account/wallet-balance", { query: { accountType: "UNIFIED" }, signed: true });
      const usdt = res?.list?.[0]?.coin?.find((c) => c.coin === "USDT");
      return { cash: usdt ? Number(usdt.walletBalance) : 0, currency: "USDT" };
    },
  };
}

/** Same lazy-resolve-then-memoize pattern as manifold.ts's
 *  `createManifoldAdapterForUser` / kalshiDemo.ts's
 *  `createKalshiDemoAdapterForUser`, for the identical reason: this phase
 *  does not touch `venues/index.ts`'s synchronous factory. */
export function createBybitDemoAdapterForUser(userId: string): VenueAdapter {
  let innerPromise: Promise<VenueAdapter> | null = null;
  function inner(): Promise<VenueAdapter> {
    if (!innerPromise) {
      innerPromise = getVenueSecret(userId, "bybit-demo").then((raw) => createBybitDemoAdapter(raw));
    }
    return innerPromise;
  }

  return {
    id: "bybit-demo",
    mode: "demo",
    currency: "USDT",
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
