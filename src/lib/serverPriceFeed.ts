import { mulberry32 } from "./math";

/** Server-side price fetch — the framework-agnostic logic behind
 *  /api/crypto/[symbol] and /api/quotes/[symbol], extracted so the Phase C
 *  cron trigger evaluator (src/app/api/cron/evaluate-triggers/route.ts) can
 *  call the exact same upstream calls those routes do, instead of the
 *  evaluator self-fetching from Next.js's own routes over HTTP. Both route
 *  handlers now call these too, so there's one implementation, not two. */

// Bitstamp ticker pairs / CoinGecko ids for the three crypto assets — the
// asset's own `id` already matches the Bitstamp pair name (btcusd, ethusd,
// solusd), so only CoinGecko needs a lookup.
const COINGECKO_ID: Record<string, string> = {
  btcusd: "bitcoin",
  ethusd: "ethereum",
  solusd: "solana",
};

async function bitstamp(pair: string): Promise<number> {
  const res = await fetch(`https://www.bitstamp.net/api/v2/ticker/${pair}/`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`bitstamp ${res.status}`);
  const j = await res.json();
  return Number(j.last);
}

async function coingecko(id: string): Promise<number> {
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const j = await res.json();
  return Number(j[id]?.usd);
}

export interface PriceResult {
  price: number;
  source: string;
  mock?: boolean;
}

/** btcusd/ethusd/solusd only. No app-enforced rate limit — Bitstamp/
 *  CoinGecko have no documented per-key ceiling the way TwelveData does. */
export async function getCryptoPrice(assetId: string): Promise<PriceResult | null> {
  const coingeckoId = COINGECKO_ID[assetId];
  if (!coingeckoId) return null;
  for (const [source, fn] of [
    ["bitstamp", () => bitstamp(assetId)],
    ["coingecko", () => coingecko(coingeckoId)],
  ] as const) {
    try {
      const price = await fn();
      if (price > 0) return { price, source };
    } catch {
      /* try next */
    }
  }
  return null;
}

// Base anchor prices for the deterministic mock fallback (roughly realistic
// as of this writing — a real deployment overrides this entirely once
// TWELVE_DATA_API_KEY is set, this path only exists so the app runs today
// without any API key configured).
const MOCK_BASE: Record<string, number> = {
  xauusd: 2650,
  eurusd: 1.085,
  gbpusd: 1.265,
  usdjpy: 154.5,
};

// Twelve Data symbol format differs slightly from our ids.
const TWELVE_DATA_SYMBOL: Record<string, string> = {
  xauusd: "XAU/USD",
  eurusd: "EUR/USD",
  gbpusd: "GBP/USD",
  usdjpy: "USD/JPY",
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** xauusd/eurusd/gbpusd/usdjpy only. TWELVE_DATA_API_KEY's free tier is 800
 *  req/day — callers evaluating triggers at a high cadence across all 4
 *  assets must cache this themselves (see the cron evaluator's price_history
 *  staleness window) rather than calling this every tick. Falls back to a
 *  deterministic seeded mock (never Math.random(), never silently presented
 *  as real — `mock: true` on the result) when no key is set or the fetch
 *  fails, same as the app has always done without a key configured. */
export async function getQuotePrice(assetId: string): Promise<PriceResult | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  const tdSymbol = TWELVE_DATA_SYMBOL[assetId];
  if (!tdSymbol) return null;

  if (apiKey) {
    try {
      const r = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(tdSymbol)}&apikey=${apiKey}`, {
        cache: "no-store",
      });
      const j = await r.json();
      const price = Number(j.price);
      if (price > 0) return { price, source: "twelvedata", mock: false };
    } catch {
      /* fall through to mock */
    }
  }

  // Deterministic mock: a slow seeded random walk anchored to a plausible
  // base price, re-seeded every 30s so the "anchor" moves like a real feed
  // would between polls, without ever calling Math.random().
  const bucket = Math.floor(Date.now() / 30_000);
  const rng = mulberry32(bucket ^ hashStr(assetId));
  const base = MOCK_BASE[assetId] ?? 100;
  const drift = (rng() - 0.5) * base * 0.002;
  return { price: Math.max(0.0001, base + drift), source: "mock", mock: true };
}
