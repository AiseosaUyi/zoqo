// ZOQO simulation engine.
//
// Real BTC price drives a market of rolling 5-minute "Up/Down" predictions.
// On top of the real price we synthesize a believable order flow — retail
// trades arriving at random (Poisson) intervals plus occasional whale buys
// that show up as spikes — and an implied YES probability that is *anchored to
// the real BTC price vs. the strike* (Bachelier-style normal approximation),
// nudged by live order-flow imbalance. Seeded per session, so every visit is
// a different tape but the dynamics stay coherent.

import type {
  Candle, Holder, Market, OrderBook, OrderBookLevel, ProbPoint, Side,
  Spike, Trade, VolumeBucket, EngineSnapshot,
} from "./types";
import { clamp, exponentialMs, gaussian, mulberry32, normCdf, pick, realizedVol, type Rng } from "./math";

/** Available market durations (the top-tab "market selector"). */
export const DURATIONS_MIN = [5, 10, 15, 30, 60] as const;
const DURATIONS = DURATIONS_MIN.map((m) => m * 60_000);
const N_PAST = 12; // keep a deep tail of settled markets so the timeline can pan back
const N_FUTURE = 1; // exactly one upcoming market ahead of live
const PRUNE_MS = 6 * 3_600_000; // keep markets up to ~6h old
const BUCKETS = 90; // volume/prob samples per window (~3.3s each)
const MAX_TRADES = 60;
const MAX_SPIKES = 40;
const WHALE_PROB = 0.035;
const BASE_RATE = 1.6; // retail trades / second (per live market)

const FIRST_NAMES = ["Ava","Leo","Mia","Kai","Zoe","Eli","Nia","Rio","Ivy","Max","Jin","Ada","Sol","Rey","Uma","Cy","Noa","Tariq","Lena","Oba","Quin","Ines","Dev","Yuki","Amara","Bode"];
const LAST_INITIALS = ["B.","C.","D.","K.","M.","N.","P.","R.","S.","T.","V.","W.","Z."];
const WHALE_NAMES = ["WhaleByte","Leviathan","0xMoby","DeepPockets","Kraken","BlockWhale","MegalodonDAO","TidalFund","OrcaCap","Poseidon"];

interface MktState {
  m: Market;
  flow: number; // order-flow pressure in cents, mean-reverts to 0
  buckets: VolumeBucket[];
  prob: ProbPoint[];
  spikes: Spike[];
  book: OrderBook;
  holders: Holder[];
  openPriceSet: boolean;
}

export interface EngineInit {
  history: Candle[];
  now: number;
  seed: number;
}

export class MarketEngine {
  private rng: Rng;
  private vol: number; // per-minute realized vol (fraction)
  private candles: Candle[];
  private states = new Map<string, MktState>();
  private trades: Trade[] = [];
  private price: number;
  private lastStep: number;
  now: number;

  constructor(init: EngineInit) {
    this.rng = mulberry32(init.seed);
    this.candles = init.history.slice();
    this.now = init.now;
    this.lastStep = init.now;
    this.price = init.history.at(-1)?.c ?? 64000;
    this.vol = realizedVol(this.candles.slice(-120).map((c) => c.c));
    this.seedTimeline();
  }

  // ---- timeline ----
  private windowOpen(t: number, dur: number) {
    return Math.floor(t / dur) * dur;
  }

  private priceAt(t: number): number {
    // nearest candle open at/after t, else last close
    let best: Candle | undefined;
    for (const c of this.candles) {
      if (c.t <= t) best = c;
      else break;
    }
    return best?.o ?? this.price;
  }

  private mkId(open: number, dur: number) {
    return `btc-${dur / 60_000}m-${open}`;
  }

  private seedTimeline() {
    for (const dur of DURATIONS) {
      const liveOpen = this.windowOpen(this.now, dur);
      for (let i = -N_PAST; i <= N_FUTURE; i++) {
        this.ensureMarket(liveOpen + i * dur, dur);
      }
    }
    // backfill settled markets fully, and live markets up to "now", so the
    // chart, prob area and volume look alive the instant the app opens.
    for (const st of this.states.values()) {
      if (st.m.status === "settled") this.backfill(st, st.m.closeTime);
      else if (st.m.status === "live") this.backfill(st, this.now);
    }
  }

  private ensureMarket(open: number, dur: number): MktState {
    const id = this.mkId(open, dur);
    const existing = this.states.get(id);
    if (existing) return existing;

    const close = open + dur;
    const isLiveOrPast = open <= this.now;
    const openPrice = isLiveOrPast ? this.priceAt(open) : this.price;
    // strike = the exact price at the window open (i.e. the prior market's
    // close), matching how Polymarket/Stand set their "price to beat".
    const strike = Math.round(openPrice * 100) / 100;
    const status: Market["status"] =
      close <= this.now ? "settled" : open <= this.now ? "live" : "upcoming";

    const closePrice = status === "settled" ? this.priceAt(close) : this.price;
    const m: Market = {
      id,
      symbol: "BTC",
      label: hhmmLabel(close),
      durationMs: dur,
      openTime: open,
      closeTime: close,
      strike,
      status,
      openPrice,
      lastPrice: status === "settled" ? closePrice : this.price,
      yes: 50,
      changePct: openPrice ? ((this.price - openPrice) / openPrice) * 100 : 0,
      volumeUsd: 0,
      settledUp: status === "settled" ? closePrice >= strike : undefined,
    };

    const st: MktState = {
      m,
      flow: 0,
      buckets: Array.from({ length: BUCKETS }, (_, i) => ({
        t: open + (i * dur) / BUCKETS,
        up: 0,
        down: 0,
      })),
      prob: [],
      spikes: [],
      book: emptyBook(),
      holders: this.seedHolders(),
      openPriceSet: isLiveOrPast,
    };
    this.computeYes(st);
    this.refreshBook(st);
    this.states.set(id, st);
    return st;
  }

  private seedHolders(): Holder[] {
    const n = 5 + Math.floor(this.rng() * 3);
    return Array.from({ length: n }, () => {
      const whale = this.rng() < 0.3;
      return {
        trader: this.trader(whale),
        side: this.rng() < 0.55 ? "up" : "down",
        shares: Math.round((whale ? 4000 : 400) * (0.5 + this.rng() * 2)),
        avgPrice: 30 + this.rng() * 50,
      } as Holder;
    }).sort((a, b) => b.shares - a.shares);
  }

  private trader(whale: boolean) {
    if (whale)
      return { name: pick(this.rng, WHALE_NAMES), avatar: "whale" };
    return {
      name: `${pick(this.rng, FIRST_NAMES)} ${pick(this.rng, LAST_INITIALS)}`,
      avatar: "u",
    };
  }

  // ---- pricing ----
  private fairYes(st: MktState): number {
    const m = st.m;
    if (m.status === "settled") return m.settledUp ? 99.5 : 0.5;
    const tauMin = Math.max(0.02, (m.closeTime - this.now) / 60_000);
    const sigma = this.price * this.vol * Math.sqrt(tauMin); // $ stdev to close
    if (sigma <= 0) return this.price >= m.strike ? 99 : 1;
    const z = (this.price - m.strike) / sigma;
    return clamp(normCdf(z) * 100, 0.5, 99.5);
  }

  private computeYes(st: MktState) {
    const fair = this.fairYes(st);
    // order-flow pressure decays toward 0; blended into the displayed price
    const blended = clamp(fair + st.flow, 1, 99);
    if (st.m.status === "settled") {
      // frozen at settlement — lastPrice is the close, changePct is close-vs-open.
      // Never overwrite with the live price (that made settled columns show the
      // current price and disagree with settledUp, e.g. "DOWN +$12").
      st.m.yes = st.m.settledUp ? 100 : 0;
      return;
    }
    st.m.yes = round1(blended);
    st.m.lastPrice = this.price;
    st.m.changePct = st.m.openPrice
      ? ((this.price - st.m.openPrice) / st.m.openPrice) * 100
      : 0;
  }

  // ---- order book ----
  private refreshBook(st: MktState) {
    const yes = clamp(st.m.yes, 2, 98);
    const mid = yes;
    const levels = 8;
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];
    let cb = 0;
    let ca = 0;
    for (let i = 0; i < levels; i++) {
      const bp = round1(mid - 0.5 - i * (0.6 + this.rng() * 0.8));
      const ap = round1(mid + 0.5 + i * (0.6 + this.rng() * 0.8));
      const bs = Math.round((300 + this.rng() * 2600) * (1 - i / (levels + 2)));
      const as = Math.round((300 + this.rng() * 2600) * (1 - i / (levels + 2)));
      cb += bs;
      ca += as;
      if (bp > 0) bids.push({ price: bp, shares: bs, cumulative: cb });
      if (ap < 100) asks.push({ price: ap, shares: as, cumulative: ca });
    }
    const maxCum = Math.max(cb, ca, 1);
    st.book = {
      bids,
      asks,
      last: st.book.last || yes,
      lastAgeSec: st.book.lastAgeSec,
      spread: round1((asks[0]?.price ?? yes) - (bids[0]?.price ?? yes)),
      maxCumulative: maxCum,
    };
  }

  // ---- synthetic tape ----
  private liveStates(): MktState[] {
    const out: MktState[] = [];
    for (const st of this.states.values()) if (st.m.status === "live") out.push(st);
    return out;
  }

  private bucketIndex(st: MktState, ts: number) {
    return clamp(
      Math.floor(((ts - st.m.openTime) / st.m.durationMs) * BUCKETS),
      0,
      BUCKETS - 1,
    );
  }

  private emitTrade(st: MktState, ts: number, forcedWhale?: boolean) {
    const m = st.m;
    const pUp = clamp(0.5 + ((m.yes - 50) / 100) * 0.7 + (this.rng() - 0.5) * 0.3, 0.12, 0.88);
    const side: Side = this.rng() < pUp ? "up" : "down";
    const whale = forcedWhale ?? this.rng() < WHALE_PROB;

    const notional = whale
      ? 5000 + this.rng() * 55000
      : Math.exp(2 + gaussian(this.rng) * 1.1) * 6; // ~$5–$900, fat tail
    const px = clamp(
      (side === "up" ? m.yes : 100 - m.yes) + (this.rng() - 0.5) * 1.2,
      1,
      99,
    );
    const shares = Math.max(1, Math.round((notional / (px / 100)) ));
    const trade: Trade = {
      id: `t${ts.toString(36)}${Math.floor(this.rng() * 1e4).toString(36)}`,
      marketId: m.id,
      ts,
      side,
      price: round1(px),
      shares,
      notional,
      trader: this.trader(whale),
      whale,
    };

    // effects
    const bi = this.bucketIndex(st, ts);
    if (side === "up") st.buckets[bi].up += notional;
    else st.buckets[bi].down += notional;
    m.volumeUsd += notional;

    // order-flow pressure: buys of UP push yes up, buys of DOWN push it down
    const impact = (notional / 9000) * (side === "up" ? 1 : -1);
    st.flow = clamp(st.flow + impact, -14, 14);

    this.trades.unshift(trade);
    if (this.trades.length > MAX_TRADES) this.trades.pop();
    st.book.last = trade.price;
    st.book.lastAgeSec = 0;

    if (whale || notional > 1500) {
      st.spikes.push({
        id: trade.id,
        ts,
        side,
        price: m.yes,
        notional,
        whale,
      });
      if (st.spikes.length > MAX_SPIKES) st.spikes.shift();
      // whales also move a holder
      if (whale) {
        st.holders.push({ trader: trade.trader, side, shares: trade.shares, avgPrice: trade.price });
        st.holders.sort((a, b) => b.shares - a.shares);
        st.holders = st.holders.slice(0, 8);
      }
    }
    return trade;
  }

  /** Advance the simulation to `now` using the latest real BTC `price`. */
  step(now: number, price: number) {
    if (price > 0) this.price = price;
    const prev = this.now;
    this.now = now;
    const dt = Math.max(0, now - prev);

    // roll every duration's timeline forward
    for (const dur of DURATIONS) {
      const liveOpen = this.windowOpen(now, dur);
      for (let i = -N_PAST; i <= N_FUTURE; i++) this.ensureMarket(liveOpen + i * dur, dur);
    }
    // settle / promote statuses
    for (const st of this.states.values()) this.updateStatus(st);
    // prune very old markets
    for (const [id, st] of this.states) {
      if (st.m.closeTime < now - PRUNE_MS) this.states.delete(id);
    }

    // generate retail tape for each duration's live market across the elapsed dt.
    // Shorter markets get a livelier tape; longer ones are calmer.
    if (dt > 0) {
      for (const live of this.liveStates()) {
        const durMin = live.m.durationMs / 60_000;
        const rate =
          (BASE_RATE / Math.sqrt(durMin / 5)) * (1 + Math.min(2, this.vol * 800));
        let t = prev;
        while (true) {
          t += exponentialMs(this.rng, rate);
          if (t > now) break;
          this.emitTrade(live, t);
        }
        live.flow *= Math.pow(0.5, dt / 9000);
        live.book.lastAgeSec += dt / 1000;
      }
    }

    // recompute prices, prob samples, books
    for (const st of this.states.values()) {
      this.computeYes(st);
      if (st.m.status !== "upcoming") this.sampleProb(st, now);
      if (st.m.status === "live") this.refreshBook(st);
    }
    this.lastStep = now;
  }

  private updateStatus(st: MktState) {
    const m = st.m;
    const wasLive = m.status === "live";
    if (m.closeTime <= this.now) {
      if (m.status !== "settled") {
        m.status = "settled";
        const closePrice = this.price;
        m.settledUp = closePrice >= m.strike;
        m.lastPrice = closePrice;
        m.changePct = m.openPrice ? ((closePrice - m.openPrice) / m.openPrice) * 100 : 0;
      }
    } else if (m.openTime <= this.now) {
      if (!wasLive && m.status === "upcoming") {
        // promote: lock the strike at the real open price (the prior close)
        m.openPrice = this.price;
        m.strike = Math.round(this.price * 100) / 100;
        st.openPriceSet = true;
      }
      m.status = "live";
    }
  }

  private sampleProb(st: MktState, now: number) {
    const last = st.prob.at(-1);
    if (!last || now - last.t > st.m.durationMs / BUCKETS) {
      st.prob.push({ t: now, yes: st.m.yes });
      if (st.prob.length > BUCKETS + 4) st.prob.shift();
    } else {
      last.yes = st.m.yes;
    }
  }

  // fill a market with a believable tape (volume + prob path) up to `until`.
  private backfill(st: MktState, until: number) {
    const m = st.m;
    const dur = m.durationMs;
    const openP = m.openPrice;
    const closeP = this.priceAt(until) || this.price;
    const fillTo = clamp(Math.ceil(((until - m.openTime) / dur) * BUCKETS), 1, BUCKETS);
    for (let i = 0; i < fillTo; i++) {
      const f = i / (BUCKETS - 1);
      const tHere = m.openTime + f * dur;
      if (tHere > until) break;
      const pHere = openP + (closeP - openP) * f + gaussian(this.rng) * openP * this.vol * 0.4;
      const tau = Math.max(0.02, (m.closeTime - tHere) / 60_000);
      const sigma = pHere * this.vol * Math.sqrt(tau);
      const yes = sigma > 0 ? clamp(normCdf((pHere - m.strike) / sigma) * 100, 1, 99) : (pHere >= m.strike ? 99 : 1);
      st.prob.push({ t: tHere, yes: round1(yes) });
      // volume: random with a few bursts
      const burst = this.rng() < 0.12 ? 1 + this.rng() * 6 : 1;
      const vUp = this.rng() * 1400 * burst;
      const vDn = this.rng() * 1400 * burst;
      st.buckets[i].up = vUp;
      st.buckets[i].down = vDn;
      m.volumeUsd += vUp + vDn;
      if (burst > 3) {
        const whale = burst > 5;
        st.spikes.push({
          id: `bf${m.id}-${i}`,
          ts: tHere,
          side: this.rng() < (yes / 100) ? "up" : "down",
          price: yes,
          notional: (whale ? 8000 : 2000) * burst,
          whale,
        });
      }
    }
  }

  // ---- user trade (so the trader sees their own order on the tape) ----
  applyUserTrade(marketId: string, side: Side, shares: number, price: number) {
    const st = this.states.get(marketId);
    if (!st) return;
    const notional = shares * (price / 100);
    const bi = this.bucketIndex(st, this.now);
    if (side === "up") st.buckets[bi].up += notional;
    else st.buckets[bi].down += notional;
    st.m.volumeUsd += notional;
    st.flow = clamp(st.flow + (notional / 9000) * (side === "up" ? 1 : -1), -14, 14);
    const trade: Trade = {
      id: `you-${this.now.toString(36)}`,
      marketId,
      ts: this.now,
      side,
      price: round1(price),
      shares,
      notional,
      trader: { name: "You", avatar: "you" },
      whale: notional > 5000,
    };
    this.trades.unshift(trade);
    if (this.trades.length > MAX_TRADES) this.trades.pop();
  }

  marketById(id: string): Market | undefined {
    return this.states.get(id)?.m;
  }

  snapshot(): EngineSnapshot {
    const markets: Market[] = [];
    const spikesByMarket: Record<string, Spike[]> = {};
    const volumeByMarket: Record<string, VolumeBucket[]> = {};
    const probByMarket: Record<string, ProbPoint[]> = {};
    const orderBookByMarket: Record<string, OrderBook> = {};
    const holdersByMarket: Record<string, Holder[]> = {};
    let liveMarketId = "";

    const sorted = [...this.states.values()].sort((a, b) => a.m.openTime - b.m.openTime);
    for (const st of sorted) {
      markets.push({ ...st.m });
      if (st.m.status === "live") liveMarketId = st.m.id;
      spikesByMarket[st.m.id] = st.spikes.slice();
      volumeByMarket[st.m.id] = st.buckets.map((b) => ({ ...b }));
      probByMarket[st.m.id] = st.prob.slice();
      orderBookByMarket[st.m.id] = {
        ...st.book,
        bids: st.book.bids.slice(),
        asks: st.book.asks.slice(),
      };
      holdersByMarket[st.m.id] = st.holders.slice();
    }

    return {
      now: this.now,
      markets,
      liveMarketId,
      trades: this.trades.slice(),
      spikesByMarket,
      volumeByMarket,
      probByMarket,
      orderBookByMarket,
      holdersByMarket,
    };
  }

  get candleHistory(): Candle[] {
    return this.candles;
  }

  get lastPrice(): number {
    return this.price;
  }
}

// ---- helpers ----
function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function hhmmLabel(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function emptyBook(): OrderBook {
  return { bids: [], asks: [], last: 0, lastAgeSec: 0, spread: 0, maxCumulative: 1 };
}
