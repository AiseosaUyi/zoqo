// Technical indicators for the terminal chart — TERMINAL_SPEC.md §4 called
// these out explicitly ("custom indicator overlays... computed client-side
// from OHLC history") and they were never actually built; DrawingToolbar got
// its 68-tools-curated-to-12 treatment but the "Indicators" button next to it
// didn't exist at all. This is real math over the candle series, not a
// decorative dropdown — every formula below is the standard textbook
// definition so values match what a trader already expects from any other
// platform.
//
// There is deliberately no Volume indicator here: `Candle` (candles.ts) only
// carries o/h/l/c — this simulation has no real trade-volume feed to draw
// from (BTC/ETH/SOL come from a real price WS, gold/forex from a polled
// price anchor; neither exposes volume), and fabricating one would be
// exactly the "looks real, isn't" problem this pass exists to remove.
import type { Candle } from "./candles";

export interface IndicatorPoint {
  time: number; // seconds, matches TerminalChart's UTCTimestamp
  value: number;
}
export interface BandPoint {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}
export interface MacdPoint {
  time: number;
  macd: number;
  signal: number;
  hist: number;
}

const toSec = (c: Candle) => Math.floor(c.t / 1000);

export function sma(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].c;
    if (i >= period) sum -= candles[i - period].c;
    if (i >= period - 1) out.push({ time: toSec(candles[i]), value: sum / period });
  }
  return out;
}

/** Standard EMA seeded with the SMA of the first `period` closes, same
 *  convention every charting library uses so values line up with TradingView. */
export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += candles[i].c;
  let prev = seed / period;
  out.push({ time: toSec(candles[period - 1]), value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].c * k + prev * (1 - k);
    out.push({ time: toSec(candles[i]), value: prev });
  }
  return out;
}

/** Bollinger Bands: SMA basis ± `mult` population standard deviations. */
export function bollingerBands(candles: Candle[], period: number, mult: number): BandPoint[] {
  const out: BandPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const mean = window.reduce((s, c) => s + c.c, 0) / period;
    const variance = window.reduce((s, c) => s + (c.c - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    out.push({ time: toSec(candles[i]), upper: mean + mult * sd, middle: mean, lower: mean - mult * sd });
  }
  return out;
}

/** Wilder's RSI — the original smoothing method (not a plain SMA of
 *  gains/losses), matching what every real platform ships as "RSI". */
export function rsi(candles: Candle[], period = 14): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].c - candles[i - 1].c;
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  const push = (i: number) => {
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const value = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    out.push({ time: toSec(candles[i]), value });
  };
  push(period);
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].c - candles[i - 1].c;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    push(i);
  }
  return out;
}

/** MACD(fast, slow, signal) — macd = EMA(fast) - EMA(slow) aligned by time,
 *  signal = EMA(macd, signal period), histogram = macd - signal. */
export function macd(candles: Candle[], fast = 12, slow = 26, signalPeriod = 9): MacdPoint[] {
  const fastE = ema(candles, fast);
  const slowE = ema(candles, slow);
  const slowByTime = new Map(slowE.map((p) => [p.time, p.value]));
  const macdLine: IndicatorPoint[] = [];
  for (const f of fastE) {
    const s = slowByTime.get(f.time);
    if (s != null) macdLine.push({ time: f.time, value: f.value - s });
  }
  if (macdLine.length < signalPeriod) return [];
  // EMA of the macd line itself, seeded the same way ema() seeds a price EMA.
  const k = 2 / (signalPeriod + 1);
  let seed = 0;
  for (let i = 0; i < signalPeriod; i++) seed += macdLine[i].value;
  let prevSignal = seed / signalPeriod;
  const out: MacdPoint[] = [
    {
      time: macdLine[signalPeriod - 1].time,
      macd: macdLine[signalPeriod - 1].value,
      signal: prevSignal,
      hist: macdLine[signalPeriod - 1].value - prevSignal,
    },
  ];
  for (let i = signalPeriod; i < macdLine.length; i++) {
    prevSignal = macdLine[i].value * k + prevSignal * (1 - k);
    out.push({ time: macdLine[i].time, macd: macdLine[i].value, signal: prevSignal, hist: macdLine[i].value - prevSignal });
  }
  return out;
}

export type IndicatorId = "sma20" | "sma50" | "ema20" | "ema50" | "bb20" | "rsi14" | "macd";

export interface IndicatorDef {
  id: IndicatorId;
  label: string;
  group: "Overlays" | "Oscillators";
  pane: "price" | "rsi" | "macd";
}

/** A curated 7, not TradingView's full library of hundreds — same "curated
 *  subset over a flat wall of options" call DrawingToolbar already made for
 *  drawing tools, for the same reason. */
export const INDICATOR_DEFS: IndicatorDef[] = [
  { id: "sma20", label: "SMA (20)", group: "Overlays", pane: "price" },
  { id: "sma50", label: "SMA (50)", group: "Overlays", pane: "price" },
  { id: "ema20", label: "EMA (20)", group: "Overlays", pane: "price" },
  { id: "ema50", label: "EMA (50)", group: "Overlays", pane: "price" },
  { id: "bb20", label: "Bollinger Bands (20, 2)", group: "Overlays", pane: "price" },
  { id: "rsi14", label: "RSI (14)", group: "Oscillators", pane: "rsi" },
  { id: "macd", label: "MACD (12, 26, 9)", group: "Oscillators", pane: "macd" },
];
export const INDICATOR_BY_ID: Record<IndicatorId, IndicatorDef> = Object.fromEntries(
  INDICATOR_DEFS.map((d) => [d.id, d]),
) as Record<IndicatorId, IndicatorDef>;
