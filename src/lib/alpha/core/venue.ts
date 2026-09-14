/** ZOQO Alpha's venue abstraction (docs/alpha/03-architecture.md §2). Every
 *  trading/betting surface Alpha touches — the existing terminal, the
 *  existing prediction market, the new NGN paper sportsbook, and every
 *  external demo venue — implements this one interface. Nothing in
 *  src/lib/alpha/ ever calls a venue's SDK or REST client directly outside
 *  of a module in src/lib/alpha/venues/ that implements VenueAdapter. This
 *  is what makes the risk gate (risk.ts) and the runner (runner.ts) venue-
 *  agnostic: they only ever see this shape. */

export type VenueId =
  | "zoqo-terminal"
  | "zoqo-predict"
  | "zoqo-sportsbook"
  | "manifold"
  | "kalshi-demo"
  | "bybit-demo"
  | "deriv-virtual"
  | "polymarket-sim";

/** 'live' is a real member of this union because Intent/order plumbing has
 *  to type-check against it (a rejected value still needs a type) — but no
 *  adapter constructor in this program is ever instantiated with it, and
 *  the schema-level check constraint on alpha_venues.mode physically
 *  disallows storing it. See docs/alpha/03-architecture.md's non-goals. */
export type VenueMode = "paper" | "demo" | "live";

export interface MarketRef {
  venue: VenueId;
  marketId: string;
  outcomeId?: string;
}

export interface Quote {
  market: MarketRef;
  ts: number;
  bid?: number;
  ask?: number;
  last?: number;
  decimalOdds?: number;
  impliedProb?: number;
  book?: string;
}

export type IntentSide = "buy" | "sell" | "long" | "short" | "back" | "lay" | "yes" | "no";

export interface Intent {
  strategyId: string;
  market: MarketRef;
  side: IntentSide;
  kind: "market" | "limit";
  limitPrice?: number;
  /** Price-venue-only (e.g. zoqo-terminal, bybit-demo, deriv-virtual) —
   *  ignored by odds venues. Carried on the intent rather than only in
   *  `features` because it's an order attribute the adapter's `place()`
   *  must act on, not just a value to log. */
  stopLoss?: number;
  takeProfit?: number;
  /** modelProb - marketProb (or expected return), signed. This is the
   *  number risk.ts's min-edge filter checks against `strategy.min_edge`. */
  edge: number;
  modelProb?: number;
  marketProb?: number;
  /** Fraction of strategy budget, BEFORE the risk gate — the gate may size
   *  down (Kelly, caps) or reject outright. Never treat this as the stake. */
  suggestedStakePct?: number;
  /** Stored verbatim in alpha_decisions.rationale — human-readable, not a
   *  key for programmatic branching. */
  rationale: string;
  /** Snapshot of every feature the strategy used to decide, stored verbatim
   *  in alpha_decisions.features. No feature may read a result — see the
   *  hard rule in docs/alpha/PROMPT-build-alpha.md. */
  features?: Record<string, number | string>;
  expiresAt?: number;
  /** Copy-trading provenance (docs/alpha/08-copy-trading.md §3/§6) — set
   *  only by a copy strategy (`strategies/lib/copyTrading.ts`), stored
   *  verbatim on `alpha_decisions.source_id`/`lag_ms`/`slippage_bps` by
   *  `service.executeIntent`. `undefined` for every non-copy intent. */
  copyMeta?: { sourceId: string; lagMs: number; slippageBps: number | null };
}

export type PlacedOrderCurrency = "USD" | "NGN" | "MANA" | "USDT";
export type PlacedOrderStatus = "open" | "filled" | "partial" | "rejected" | "cancelled";

export interface PlacedOrder {
  venueOrderId: string;
  market: MarketRef;
  side: IntentSide;
  stake: number;
  currency: PlacedOrderCurrency;
  priceOrOdds: number;
  placedAt: number;
  status: PlacedOrderStatus;
}

export type SettlementOutcome = "won" | "lost" | "void" | "closed";

export interface Settlement {
  venueOrderId: string;
  outcome: SettlementOutcome;
  pnl: number;
  settledAt: number;
  closingPriceOrOdds?: number;
}

/** The context a venue adapter needs to place an order that a human,
 *  the scheduler, and an MCP-driven agent all pass identically — nothing
 *  venue-specific leaks into this shape. */
export interface ExecCtx {
  userId: string;
  now: number;
}

export interface VenueAdapter {
  id: VenueId;
  mode: VenueMode;
  currency: PlacedOrderCurrency;
  listMarkets(q: { query?: string; category?: string; limit?: number }): Promise<MarketRef[]>;
  getQuote(m: MarketRef): Promise<Quote | null>;
  place(intent: Intent, stake: number, ctx: ExecCtx): Promise<PlacedOrder>;
  cancel?(venueOrderId: string): Promise<void>;
  openOrders(): Promise<PlacedOrder[]>;
  settle(open: PlacedOrder[]): Promise<Settlement[]>;
  balance(): Promise<{ cash: number; currency: PlacedOrderCurrency }>;
}
