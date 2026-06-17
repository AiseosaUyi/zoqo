import { NextResponse } from "next/server";
import type { Candle } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

/** Binance klines (server-side; no CORS issue). */
async function fromBinance(interval: string, limit: number): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const rows: unknown[][] = await res.json();
  return rows.map((r) => ({
    t: Number(r[0]),
    o: Number(r[1]),
    h: Number(r[2]),
    l: Number(r[3]),
    c: Number(r[4]),
    v: Number(r[5]),
  }));
}

/** Bitstamp OHLC fallback (broadly reachable, real 1-min data). */
async function fromBitstamp(interval: string, limit: number): Promise<Candle[]> {
  const step = INTERVAL_SECONDS[interval] ?? 60;
  const url = `https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=${step}&limit=${Math.min(
    1000,
    limit,
  )}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`bitstamp ${res.status}`);
  const json = await res.json();
  const rows: Record<string, string>[] = json?.data?.ohlc ?? [];
  return rows.map((r) => ({
    t: Number(r.timestamp) * 1000,
    o: Number(r.open),
    h: Number(r.high),
    l: Number(r.low),
    c: Number(r.close),
    v: Number(r.volume),
  }));
}

/** CoinGecko market_chart — last-resort (price-only, ~5-min granularity). */
async function fromCoinGecko(interval: string, limit: number): Promise<Candle[]> {
  const g = INTERVAL_SECONDS[interval] ?? 60;
  const spanSec = g * limit;
  const days = Math.max(1, Math.ceil(spanSec / 86400));
  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const json = await res.json();
  const prices: [number, number][] = json?.prices ?? [];
  return prices.slice(-limit).map(([t, p]) => ({ t, o: p, h: p, l: p, c: p, v: 0 }));
}

/** Coinbase Exchange candles fallback (US-friendly). */
async function fromCoinbase(interval: string, limit: number): Promise<Candle[]> {
  const g = INTERVAL_SECONDS[interval] ?? 60;
  const end = Math.floor(Date.now() / 1000);
  const start = end - g * limit;
  const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=${g}&start=${new Date(
    start * 1000,
  ).toISOString()}&end=${new Date(end * 1000).toISOString()}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "zoqo/1.0" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`coinbase ${res.status}`);
  // [ time, low, high, open, close, volume ] descending
  const rows: number[][] = await res.json();
  return rows
    .map((r) => ({
      t: r[0] * 1000,
      o: r[3],
      h: r[2],
      l: r[1],
      c: r[4],
      v: r[5],
    }))
    .sort((a, b) => a.t - b.t);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const interval = searchParams.get("interval") ?? "1m";
  const limit = Math.min(1000, Math.max(10, Number(searchParams.get("limit") ?? 300)));

  const sources = [
    { name: "binance", fn: fromBinance },
    { name: "coinbase", fn: fromCoinbase },
    { name: "bitstamp", fn: fromBitstamp },
    { name: "coingecko", fn: fromCoinGecko },
  ];

  for (const src of sources) {
    try {
      const candles = await src.fn(interval, limit);
      if (candles.length) {
        return NextResponse.json(
          { source: src.name, interval, candles },
          { headers: { "cache-control": "no-store" } },
        );
      }
    } catch {
      // try next source
    }
  }

  return NextResponse.json(
    { source: "none", interval, candles: [], error: "all sources failed" },
    { status: 502 },
  );
}
