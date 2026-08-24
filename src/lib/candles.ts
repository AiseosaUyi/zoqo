// 1-minute OHLC candle bookkeeping for the terminal chart, shared between
// TerminalShell (which owns the incremental per-tick updates) and
// TerminalChart (which groups the 1m base series into the selected
// timeframe). Kept separate from chartGeo.ts — that file is the /trade
// prediction market's pixel-alignment layer; this is plain OHLC math with no
// rendering concerns.
import { mulberry32, gaussian } from "./math";

export interface Candle {
  t: number; // bucket start, ms epoch, minute-aligned
  o: number;
  h: number;
  l: number;
  c: number;
}

export const CANDLE_TIMEFRAMES = [
  { key: "1m", label: "M1", minutes: 1 },
  { key: "5m", label: "M5", minutes: 5 },
  { key: "15m", label: "M15", minutes: 15 },
  { key: "30m", label: "M30", minutes: 30 },
  { key: "1h", label: "H1", minutes: 60 },
] as const;

// Per-minute log-return stdev used only to backfill history that predates
// the tab being open — see seedCandles1m. Not used once real ticks arrive.
const HISTORY_VOL: Record<string, number> = {
  btcusd: 0.0015,
  ethusd: 0.002,
  solusd: 0.003,
  xauusd: 0.0006,
  eurusd: 0.0003,
  gbpusd: 0.0004,
  usdjpy: 0.0003,
};

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Synthesizes `count` past 1-minute candles ending at "now", walked
 * backward from the real current price so the chart isn't a blank/solid
 * panel the instant an asset is selected — the same "real anchor, synthetic
 * fill" trick engine.ts already uses for past prediction markets and
 * useAssetPrice.ts uses for gold/forex ticks. Deterministic per asset (not
 * wall-clock seeded) so it's safe to call during render. The last candle's
 * close is pinned to `anchorPrice`, so the handoff to the first real tick
 * (via upsertTick) is seamless.
 */
export function seedCandles1m(assetId: string, anchorPrice: number, nowMs: number, count: number): Candle[] {
  const rng = mulberry32(hashSeed(`${assetId}:seedhist`));
  const vol = HISTORY_VOL[assetId] ?? 0.0015;
  const nowBucket = Math.floor(nowMs / 60_000) * 60_000;

  const closes = new Array<number>(count);
  closes[count - 1] = anchorPrice;
  for (let i = count - 2; i >= 0; i--) {
    closes[i] = closes[i + 1] / (1 + gaussian(rng) * vol);
  }

  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = closes[i];
    const open = i === 0 ? close : closes[i - 1];
    const wick = Math.abs(gaussian(rng)) * vol * 0.6;
    candles.push({
      t: nowBucket - (count - i) * 60_000,
      o: open,
      h: Math.max(open, close) * (1 + wick),
      l: Math.min(open, close) * (1 - wick),
      c: close,
    });
  }
  return candles;
}

/**
 * Folds one live price tick into a 1-minute base candle series: extends the
 * in-progress candle if it's still the current minute, otherwise closes it
 * and opens a new one continuing from the previous close. O(1) amortized —
 * safe to call on every tick regardless of how long the series has grown,
 * unlike re-bucketing a raw tick list (the old approach, which forced a
 * short rolling window to stay cheap and is what produced the one-giant-
 * candle bug in the first place).
 */
export function upsertTick(candles: Candle[], t: number, p: number, maxLen: number): Candle[] {
  const bucket = Math.floor(t / 60_000) * 60_000;
  const last = candles[candles.length - 1];
  if (last && last.t === bucket) {
    const updated = candles.slice();
    updated[updated.length - 1] = { ...last, h: Math.max(last.h, p), l: Math.min(last.l, p), c: p };
    return updated;
  }
  const next = [...candles, { t: bucket, o: last ? last.c : p, h: p, l: p, c: p }];
  return next.length > maxLen ? next.slice(next.length - maxLen) : next;
}

/** Groups a 1-minute base series into a coarser timeframe (M5/M15/M30/H1),
 *  aligned to clock buckets the same way a real exchange would bucket them. */
export function groupCandles(candles1m: Candle[], groupMinutes: number): Candle[] {
  if (groupMinutes <= 1) return candles1m;
  const groupMs = groupMinutes * 60_000;
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const c of candles1m) {
    const bucket = Math.floor(c.t / groupMs) * groupMs;
    if (!cur || cur.t !== bucket) {
      if (cur) out.push(cur);
      cur = { t: bucket, o: c.o, h: c.h, l: c.l, c: c.c };
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
    }
  }
  if (cur) out.push(cur);
  return out;
}
