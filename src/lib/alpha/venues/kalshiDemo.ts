import { randomUUID, sign as cryptoSign, constants as cryptoConstants } from "crypto";
import type { VenueAdapter, Intent, MarketRef, PlacedOrder, Settlement, SettlementOutcome, ExecCtx } from "../core/venue";
import { getVenueSecret } from "../secrets";

/** Kalshi demo trade-api v2 adapter (docs/alpha/02-market-landscape.md §4,
 *  docs/alpha/plans/phase-4-extra-venues.md). Kalshi is a CFTC-regulated
 *  exchange whose demo environment is "same API shape as production" per
 *  the market-landscape doc, so `mode: "demo"` (not "paper" — this is
 *  Kalshi's own designated sandbox with mock funds, distinct from
 *  Manifold's real-play-money "paper" classification, matching the
 *  VenueMode split documented in core/venue.ts).
 *
 *  BASE URL: the phase-4 build prompt specifies `demo-api.kalshi.co` as
 *  "Kalshi's actual demo base URL"; `02-market-landscape.md` §4 separately
 *  records `external-api.demo.kalshi.co`. Kalshi has used both hostnames
 *  across its docs history (the external-facing demo endpoint moved at
 *  least once) — this file follows the build prompt's explicit instruction
 *  since it's the more specific/recent source, but the discrepancy is
 *  flagged here rather than silently picking one. If live traffic 404s or
 *  DNS-fails against `BASE`, that's the first thing to check.
 *
 *  AUTH (RSA-PSS request signing, per Kalshi's documented scheme at
 *  https://trading-api.readme.io/reference — not fetched from a live
 *  connection while writing this file, reproduced from the build prompt's
 *  description of it): sign `timestamp + method + path` with the account's
 *  RSA private key, SHA-256 digest, PSS padding, and send
 *  `KALSHI-ACCESS-KEY` (the key id), `KALSHI-ACCESS-SIGNATURE` (base64
 *  signature), `KALSHI-ACCESS-TIMESTAMP` (ms since epoch, as a string).
 *  **This signing implementation is UNVERIFIED against a live Kalshi key or
 *  a real signature check** — there is no demo credential in this
 *  environment to round-trip it against (see module-level CREDENTIAL SHAPE
 *  note below). A signing failure (bad/missing key, malformed PEM) or a
 *  missing credential entirely degrades to "send the request with no auth
 *  headers, expect Kalshi to answer 401, treat that like any other failed
 *  fetch" — never a thrown exception, matching every other adapter in this
 *  directory.
 *
 *  CREDENTIAL SHAPE: Kalshi's RSA-PSS scheme needs TWO pieces per user — the
 *  API key id (sent as `KALSHI-ACCESS-KEY`) and the RSA private key that
 *  signs requests — but `secrets.ts`'s `getVenueSecret()` returns a single
 *  string (see that file). Rather than extend `getVenueSecret`'s contract
 *  for a second venue in the same phase as `bybitDemo.ts` (which needs the
 *  same two-part shape for a different reason — HMAC key+secret), this
 *  adapter reuses the *same* "less invasive" decision made there: the one
 *  string returned for `KALSHI_DEMO_API_KEY` (via secrets.ts's default
 *  `${VENUE}_API_KEY` derivation for "kalshi-demo") is expected to encode
 *  `"<accessKeyId>:<privateKeyPem>"`, split on the FIRST `:` only (a PEM's
 *  base64 body never contains a literal `:`, so this is unambiguous). Since
 *  a PEM is multi-line and most env-var tooling stores a single line, the
 *  private-key half is expected with literal `\n` escapes in place of real
 *  newlines (the common convention for stashing a PEM in one env var line);
 *  `parsePemNewlines` below undoes that before handing the key to
 *  `crypto.sign`. None of this is a Kalshi-mandated format — it's this
 *  adapter's own local convention for round-tripping two secrets through
 *  one env var, same spirit as bybitDemo.ts's `key:secret` choice. */

const BASE = "https://demo-api.kalshi.co/trade-api/v2";
const API_PATH_PREFIX = "/trade-api/v2";

interface KalshiCredential {
  accessKeyId: string;
  privateKeyPem: string;
}

/** Splits the raw `KALSHI_DEMO_API_KEY` secret into its two parts. Returns
 *  `null` on anything malformed (no `:`, empty halves) rather than
 *  throwing — an unusable credential is treated exactly like a missing one
 *  everywhere below. */
function parseCredential(raw: string | null): KalshiCredential | null {
  if (!raw) return null;
  const idx = raw.indexOf(":");
  if (idx <= 0 || idx === raw.length - 1) return null;
  const accessKeyId = raw.slice(0, idx).trim();
  const privateKeyPem = raw.slice(idx + 1).trim().replace(/\\n/g, "\n");
  if (!accessKeyId || !privateKeyPem) return null;
  return { accessKeyId, privateKeyPem };
}

/** Signs `timestamp + method + path` per Kalshi's documented scheme
 *  (verified live 2026-09-14 against docs.kalshi.com/getting_started/
 *  quick_start_authenticated_requests.md once a real credential existed to
 *  test against: `path` here must be the full API path from the root,
 *  INCLUDING the `/trade-api/v2` prefix — e.g. `/trade-api/v2/portfolio/
 *  balance`, not the bare `/portfolio/balance` every caller in this file
 *  passes around for URL construction. This function's own `path` param is
 *  that already-prefixed string — `authHeaders` below is what prepends
 *  `API_PATH_PREFIX` before calling this, exactly once, so callers never
 *  have to think about it. Returns `null` on any failure (malformed key,
 *  crypto error) instead of throwing. */
function signRequest(cred: KalshiCredential, timestampMs: string, method: string, path: string): string | null {
  try {
    const message = `${timestampMs}${method}${path}`;
    const signature = cryptoSign("sha256", Buffer.from(message, "utf8"), {
      key: cred.privateKeyPem,
      padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
      saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST,
    });
    return signature.toString("base64");
  } catch {
    return null;
  }
}

/** Builds request headers for `path` (the bare path every caller in this
 *  file already uses for URL construction, e.g. `/portfolio/balance` —
 *  NOT prefixed with `/trade-api/v2`). This function is the one place that
 *  prepends `API_PATH_PREFIX` before signing, since Kalshi's documented
 *  scheme signs the full path from the API root, prefix included (verified
 *  live 2026-09-14 — see `signRequest`'s header). With no usable credential
 *  this returns plain JSON headers and no auth — see module header: the
 *  request still goes out, Kalshi answers 401, and every caller here
 *  treats a non-2xx response as "no data", not an error. */
function authHeaders(cred: KalshiCredential | null, method: string, path: string): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!cred) return headers;
  const timestampMs = String(Date.now());
  const signature = signRequest(cred, timestampMs, method, `${API_PATH_PREFIX}${path}`);
  if (!signature) return headers; // signing failed — degrade to unauthenticated, not a throw
  headers["KALSHI-ACCESS-KEY"] = cred.accessKeyId;
  headers["KALSHI-ACCESS-SIGNATURE"] = signature;
  headers["KALSHI-ACCESS-TIMESTAMP"] = timestampMs;
  return headers;
}

interface KalshiMarket {
  ticker: string;
  title?: string;
  status?: string; // "unopened" | "open" | "closed" | "settled" (Kalshi's documented lifecycle)
  yes_bid?: number; // cents, 1-99
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  last_price?: number;
  result?: "yes" | "no" | ""; // populated once status === "settled"
}

interface KalshiMarketsResponse {
  markets?: KalshiMarket[];
  cursor?: string;
}

interface KalshiOrderResponse {
  order?: { order_id?: string; status?: string };
}

interface KalshiBalanceResponse {
  balance?: number; // cents
}

/** Never throws — a failed/blocked/malformed response degrades to `null`,
 *  exactly `manifold.ts`'s `fetchJson` convention. `path` is passed
 *  separately from the full URL because it's also what gets signed. */
async function kalshiFetch<T>(cred: KalshiCredential | null, method: "GET" | "POST", path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: authHeaders(cred, method, path),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function marketToRef(m: KalshiMarket): MarketRef {
  return { venue: "kalshi-demo", marketId: m.ticker };
}

/** Maps ZOQO's generic IntentSide union onto Kalshi's two-outcome yes/no
 *  contract shape — same collapsing pattern as manifold.ts's
 *  `intentSideToOutcome` (cited there as the origin of this convention):
 *  every affirmative side becomes "yes", everything else becomes "no". */
export function intentSideToKalshiSide(side: Intent["side"] | PlacedOrder["side"]): "yes" | "no" {
  return side === "sell" || side === "short" || side === "lay" || side === "no" ? "no" : "yes";
}

/** Pure resolution -> pnl estimate, unit-testable without the network (see
 *  __tests__/kalshiDemo.test.ts). Kalshi settles at exactly $1/contract on
 *  the winning side and $0 on the losing side (no partial/MKT-style payout
 *  the way Manifold's CPMM has) — this adapter doesn't persist the actual
 *  contract count from `place()` (PlacedOrder has no such field, same
 *  documented limitation as manifold.ts's `estimateSettlementPnl`), so
 *  contracts are approximated as `stake / priceOrOddsAtEntry` (dollars per
 *  contract at entry), same approximation shape as Manifold's. */
export function estimateSettlementPnl(params: { side: "yes" | "no"; stake: number; priceOrOddsAtEntry: number; result: "yes" | "no" | "" }): number {
  const { side, stake, result } = params;
  if (result === "") return 0; // void/undetermined — full refund, no pnl
  const entryPrice = Math.min(0.99, Math.max(0.01, params.priceOrOddsAtEntry || 0.5));
  const contracts = stake / entryPrice;
  const won = result === side;
  return won ? contracts * 1 - stake : -stake;
}

export function createKalshiDemoAdapter(rawSecret: string | null): VenueAdapter {
  const cred = parseCredential(rawSecret);

  return {
    id: "kalshi-demo",
    mode: "demo",
    currency: "USD",

    async listMarkets({ query, limit }) {
      const lim = limit ?? 20;
      const path = `/markets?limit=${Math.min(lim * 4, 200)}&status=open`;
      const res = await kalshiFetch<KalshiMarketsResponse>(cred, "GET", path);
      const markets = res?.markets ?? [];
      const needle = query?.toLowerCase();
      // No documented full-text search endpoint on trade-api/v2 — same
      // honest client-side substring fallback manifold.ts uses for category.
      const filtered = needle ? markets.filter((m) => (m.title ?? "").toLowerCase().includes(needle) || m.ticker.toLowerCase().includes(needle)) : markets;
      return filtered.slice(0, lim).map(marketToRef);
    },

    async getQuote(m) {
      const market = await kalshiFetch<KalshiMarket>(cred, "GET", `/markets/${m.marketId}`);
      if (!market) return null;
      const last = typeof market.last_price === "number" ? market.last_price / 100 : undefined;
      return {
        market: m,
        ts: Date.now(),
        bid: typeof market.yes_bid === "number" ? market.yes_bid / 100 : undefined,
        ask: typeof market.yes_ask === "number" ? market.yes_ask / 100 : undefined,
        last,
        impliedProb: last,
      };
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
      if (!cred) return rejected(0);

      const side = intentSideToKalshiSide(intent.side);
      const market = await kalshiFetch<KalshiMarket>(cred, "GET", `/markets/${intent.market.marketId}`);
      const askCents = side === "yes" ? market?.yes_ask : market?.no_ask;
      const priceCents = typeof askCents === "number" && askCents > 0 ? askCents : 50; // 50c fallback when no live quote — a market order still needs a count
      const priceOrOdds = priceCents / 100;
      const count = Math.max(1, Math.floor(stake / priceOrOdds));

      const body = { ticker: intent.market.marketId, client_order_id: randomUUID(), side, action: "buy", count, type: "market" };
      const res = await kalshiFetch<KalshiOrderResponse>(cred, "POST", "/portfolio/orders", body);
      const orderId = res?.order?.order_id;
      if (!orderId) return rejected(priceOrOdds);

      const status = res?.order?.status;
      const placedStatus: PlacedOrder["status"] = status === "canceled" ? "cancelled" : status === "resting" ? "open" : "filled";

      return {
        venueOrderId: orderId,
        market: intent.market,
        side: intent.side,
        stake: count * priceOrOdds, // actual dollars committed, not the requested stake, since count was floored
        currency: "USD",
        priceOrOdds,
        placedAt: ctx.now,
        status: placedStatus,
      };
    },

    // Same reasoning as manifold.ts/zoqoTerminal.ts: alpha_orders is the
    // source of truth for "which orders Alpha placed"; settle.ts passes the
    // exact set it needs checked into settle(open) below.
    async openOrders() {
      return [];
    },

    async settle(open: PlacedOrder[]): Promise<Settlement[]> {
      const settlements: Settlement[] = [];
      for (const order of open) {
        if (!order.venueOrderId) continue;
        const market = await kalshiFetch<KalshiMarket>(cred, "GET", `/markets/${order.market.marketId}`);
        if (!market || market.status !== "settled") continue; // still open (or lookup failed) — leave out of the result

        const side = intentSideToKalshiSide(order.side);
        const result = market.result ?? "";
        const pnl = estimateSettlementPnl({ side, stake: order.stake, priceOrOddsAtEntry: order.priceOrOdds, result });
        const outcome: SettlementOutcome = result === "" ? "void" : pnl >= 0 ? "won" : "lost";

        settlements.push({ venueOrderId: order.venueOrderId, outcome, pnl, settledAt: Date.now(), closingPriceOrOdds: result === "yes" ? 1 : result === "no" ? 0 : undefined });
      }
      return settlements;
    },

    async balance() {
      if (!cred) return { cash: 0, currency: "USD" };
      const res = await kalshiFetch<KalshiBalanceResponse>(cred, "GET", "/portfolio/balance");
      return { cash: (res?.balance ?? 0) / 100, currency: "USD" };
    },
  };
}

/** Same lazy-resolve-then-memoize pattern as manifold.ts's
 *  `createManifoldAdapterForUser`, for the same reason: `venues/index.ts`'s
 *  `createVenueAdapter` factory is synchronous, and this phase does not
 *  touch that file (it's wired in separately, per this phase's own
 *  instructions), so credential resolution happens lazily inside each
 *  method instead of at construction time. */
export function createKalshiDemoAdapterForUser(userId: string): VenueAdapter {
  let innerPromise: Promise<VenueAdapter> | null = null;
  function inner(): Promise<VenueAdapter> {
    if (!innerPromise) {
      innerPromise = getVenueSecret(userId, "kalshi-demo").then((raw) => createKalshiDemoAdapter(raw));
    }
    return innerPromise;
  }

  return {
    id: "kalshi-demo",
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

/** Raw title-bearing market fetch for `kalshiCrossVenueDivergence.ts`'s
 *  matching helper. `VenueAdapter.listMarkets()` returns bare `MarketRef`s
 *  (venue + marketId only, per core/venue.ts) with no question text, which
 *  is exactly what cross-venue text matching needs — rather than widen the
 *  shared `MarketRef` shape for one strategy's need, this is a small extra
 *  export off this module (same spirit as manifold.ts exporting
 *  `intentSideToOutcome`/`estimateSettlementPnl` beyond the adapter
 *  factory). Degrades to `[]` on any failure, never throws. */
export async function fetchKalshiMarketsWithTitles(rawSecret: string | null, limit: number): Promise<{ marketId: string; title: string }[]> {
  const cred = parseCredential(rawSecret);
  const res = await kalshiFetch<KalshiMarketsResponse>(cred, "GET", `/markets?limit=${Math.min(Math.max(limit, 1) * 2, 200)}&status=open`);
  const markets = res?.markets ?? [];
  return markets.filter((m) => !!m.title).map((m) => ({ marketId: m.ticker, title: m.title! })).slice(0, limit);
}
