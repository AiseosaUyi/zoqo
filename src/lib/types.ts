// ZOQO domain model — shared contract for engine, data layer, and UI.

/** A bet side. `up` = YES (BTC ends the window at/above strike), `down` = NO. */
export type Side = "up" | "down";

/** OHLCV candle for the BTC price chart. Times in ms epoch. */
export interface Candle {
  t: number; // open time
  o: number;
  h: number;
  l: number;
  c: number;
  v: number; // base-asset volume (informational)
}

export type MarketStatus = "settled" | "live" | "upcoming";

/**
 * A rolling 5-minute BTC market: "Will BTC be Up (>= strike) at closeTime?"
 * The YES price (cents, 1..99) is the implied probability of UP.
 */
export interface Market {
  id: string; // `btc-<dur>m-<openTime>`
  symbol: "BTC";
  label: string; // e.g. "15:05"
  durationMs: number; // market length (5/10/15/30/60 min)
  openTime: number;
  closeTime: number;
  strike: number; // resolves Up if close >= strike
  status: MarketStatus;
  openPrice: number; // BTC price when the window opened (anchors strike)
  lastPrice: number; // latest BTC price observed in the window
  yes: number; // UP price in cents (implied prob of up)
  changePct: number; // BTC % change vs openPrice, for column headers
  volumeUsd: number; // cumulative traded notional in the window
  settledUp?: boolean; // resolution for settled markets
}

export interface Trader {
  name: string;
  avatar: string; // initials-based color seed
}

export interface Trade {
  id: string;
  marketId: string;
  ts: number;
  side: Side;
  price: number; // cents per share
  shares: number;
  notional: number; // usd = shares * price/100
  trader: Trader;
  whale: boolean;
}

/** A notable buy that renders as a marker on the probability line. */
export interface Spike {
  id: string;
  ts: number;
  side: Side;
  price: number; // cents (y-position on the prob axis)
  notional: number;
  whale: boolean;
}

export interface OrderBookLevel {
  price: number; // cents
  shares: number;
  cumulative: number; // running depth for bg bars
}

export interface OrderBook {
  bids: OrderBookLevel[]; // buy UP, descending price
  asks: OrderBookLevel[]; // sell UP, ascending price
  last: number; // cents
  lastAgeSec: number;
  spread: number; // cents
  maxCumulative: number; // for normalizing depth bars
}

/** Volume per time bucket, split by side, for the histogram. */
export interface VolumeBucket {
  t: number;
  up: number; // usd
  down: number; // usd
}

/** One point of the YES-probability area series. */
export interface ProbPoint {
  t: number;
  yes: number; // cents
}

export interface Holder {
  trader: Trader;
  side: Side;
  shares: number;
  avgPrice: number;
}

export interface Position {
  marketId: string;
  side: Side;
  shares: number;
  avgPrice: number; // cents
  cost: number; // usd spent
  openedAt: number;
}

/** A working limit order that hasn't fully filled yet (Open Trades tab). */
export interface OpenOrder {
  id: string;
  marketId: string;
  label: string; // e.g. "15:10"
  strike: number;
  side: Side;
  shares: number;
  limitPrice: number; // cents
  filledPct: number; // 0..100
  placedAt: number;
  status: "working" | "partial";
  userPlaced?: boolean; // true = real order with reserved cash; false/undef = seeded demo
}

/** A resolved/closed trade (History tab). */
export interface HistoryEntry {
  id: string;
  label: string;
  strike: number;
  side: Side;
  shares: number;
  entryPrice: number; // cents
  exitPrice: number; // cents (100/0 if settled, or sell price if closed early)
  pnl: number; // usd
  result: "won" | "lost" | "closed";
  closedAt: number;
}

/** A full snapshot the UI renders from each frame. */
export interface EngineSnapshot {
  now: number;
  markets: Market[];
  liveMarketId: string;
  trades: Trade[]; // newest first, capped
  spikesByMarket: Record<string, Spike[]>;
  volumeByMarket: Record<string, VolumeBucket[]>;
  probByMarket: Record<string, ProbPoint[]>;
  orderBookByMarket: Record<string, OrderBook>;
  holdersByMarket: Record<string, Holder[]>;
}
