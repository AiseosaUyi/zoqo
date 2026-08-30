// Simulated order book for the multi-asset Terminal. No exchange anywhere
// gives ZOQO real Level 2 depth for BTC/gold/forex, so this synthesizes a
// plausible depth ladder around the one real price ZOQO does have — the
// same honesty pattern as engine.ts's Poisson tape and prediction-market
// order book (real anchor, synthesized microstructure, always labeled
// "Simulated" in the UI, never mistaken for real order flow). Reseeded every
// 2.5s of wall-clock time so the book visibly breathes without any mutable
// per-frame state, mirroring useAssetPrice.ts's tick-bucketed RNG seeding.
import { mulberry32, gaussian, type Rng } from "./math";

export interface BookLevel {
  price: number;
  size: number;
  cumulative: number;
}

export interface SimBook {
  bids: BookLevel[]; // descending price
  asks: BookLevel[]; // ascending price
  spread: number;
  maxCumulative: number;
}

const RAW_LEVELS = 60;
const RESEED_MS = 2500;

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function synthSize(rng: Rng, i: number): number {
  // Decays with distance from the touch, like a real book's liquidity taper.
  return Math.max(0.02, (0.4 + rng() * 1.6) * Math.exp(-i * 0.05));
}

/** Raw finely-spaced levels around `price`, before price-grouping. Spacing
 *  scales with price (~5bps/level) so it looks sane from EUR/USD (~$1) to
 *  BTC (~$80k) without per-asset tuning. */
function rawLevels(assetId: string, price: number, bucketMs: number) {
  const rng = mulberry32(hashSeed(`${assetId}:${bucketMs}`));
  const step = price * 0.00005;
  const bidPrices: number[] = [];
  const askPrices: number[] = [];
  const bidSizes: number[] = [];
  const askSizes: number[] = [];
  for (let i = 1; i <= RAW_LEVELS; i++) {
    bidPrices.push(price - i * step * (1 + gaussian(rng) * 0.1));
    askPrices.push(price + i * step * (1 + gaussian(rng) * 0.1));
    bidSizes.push(synthSize(rng, i));
    askSizes.push(synthSize(rng, i));
  }
  return { bidPrices, bidSizes, askPrices, askSizes };
}

/** Buckets the raw levels into `tickSize`-wide price bands (the terminal's
 *  price-grouping control), summing size per band, and returns the top
 *  `depth` bands each side with running cumulative totals for depth bars. */
export function synthBook(
  assetId: string,
  price: number,
  nowMs: number,
  tickSize: number,
  depth = 10,
): SimBook {
  if (price <= 0 || tickSize <= 0) return { bids: [], asks: [], spread: 0, maxCumulative: 0 };
  const bucketMs = Math.floor(nowMs / RESEED_MS) * RESEED_MS;
  const { bidPrices, bidSizes, askPrices, askSizes } = rawLevels(assetId, price, bucketMs);

  const bidBuckets = new Map<number, number>();
  bidPrices.forEach((p, i) => {
    const bucket = Math.floor(p / tickSize) * tickSize;
    bidBuckets.set(bucket, (bidBuckets.get(bucket) ?? 0) + bidSizes[i]);
  });
  const askBuckets = new Map<number, number>();
  askPrices.forEach((p, i) => {
    const bucket = Math.ceil(p / tickSize) * tickSize;
    askBuckets.set(bucket, (askBuckets.get(bucket) ?? 0) + askSizes[i]);
  });

  const bidEntries = [...bidBuckets.entries()].sort((a, b) => b[0] - a[0]).slice(0, depth);
  const askEntries = [...askBuckets.entries()].sort((a, b) => a[0] - b[0]).slice(0, depth);

  let cum = 0;
  const bids: BookLevel[] = bidEntries.map(([p, size]) => {
    cum += size;
    return { price: p, size, cumulative: cum };
  });
  const bidMax = cum;
  cum = 0;
  const asks: BookLevel[] = askEntries.map(([p, size]) => {
    cum += size;
    return { price: p, size, cumulative: cum };
  });
  const askMax = cum;

  const bestBid = bids[0]?.price ?? price;
  const bestAsk = asks[0]?.price ?? price;
  return { bids, asks, spread: Math.max(0, bestAsk - bestBid), maxCumulative: Math.max(bidMax, askMax, 1e-9) };
}
