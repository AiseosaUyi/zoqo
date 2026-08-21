import { NextRequest, NextResponse } from "next/server";
import { ASSET_BY_ID } from "@/lib/assets";
import { mulberry32 } from "@/lib/math";

export const dynamic = "force-dynamic";

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

/**
 * Quote route for the REST-polled asset classes (gold, forex) — crypto gets
 * its price straight from the client-side WS feeds in useAssetPrice, same as
 * the original useBtc.ts. Poll this at a low frequency (30-60s is plenty,
 * see TERMINAL_SPEC.md §3) and synthesize ticks client-side in between.
 *
 * Real data requires TWELVE_DATA_API_KEY (free tier: 800 req/day, no card,
 * https://twelvedata.com). Without it, returns a clearly-labeled deterministic
 * mock series — same house rule the rest of this app follows for anything
 * simulated (see CLAUDE.md: seeded PRNG, never Math.random(), never silently
 * presented as real).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const asset = ASSET_BY_ID[symbol];
  if (!asset || asset.assetClass === "crypto") {
    return NextResponse.json({ error: "unknown or non-REST symbol" }, { status: 404 });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (apiKey) {
    const tdSymbol = TWELVE_DATA_SYMBOL[symbol];
    try {
      const r = await fetch(
        `https://api.twelvedata.com/price?symbol=${encodeURIComponent(tdSymbol)}&apikey=${apiKey}`,
        { cache: "no-store" },
      );
      const j = await r.json();
      const price = Number(j.price);
      if (price > 0) {
        return NextResponse.json({ price, source: "twelvedata", ts: Date.now(), mock: false });
      }
    } catch {
      /* fall through to mock */
    }
  }

  // Deterministic mock: a slow seeded random walk anchored to a plausible
  // base price, re-seeded every 30s so the "anchor" moves like a real feed
  // would between polls, without ever calling Math.random().
  const bucket = Math.floor(Date.now() / 30_000);
  const rng = mulberry32(bucket ^ hashStr(symbol));
  const base = MOCK_BASE[symbol] ?? 100;
  const drift = (rng() - 0.5) * base * 0.002;
  return NextResponse.json({
    price: Math.max(0.0001, base + drift),
    source: "mock",
    ts: Date.now(),
    mock: true,
  });
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
