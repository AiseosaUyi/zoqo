import { NextRequest, NextResponse } from "next/server";
import { ASSET_BY_ID } from "@/lib/assets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
    { cache: "no-store", signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const j = await res.json();
  return Number(j[id]?.usd);
}

/**
 * Server-side polling fallback for crypto in the Terminal — plays the same
 * role /api/btc/price plays for the prediction market's useBtc.ts. Routes
 * through the server (not a direct client-side REST call) because Binance/
 * Coinbase are DNS-blocked in many local/sandboxed environments (see
 * CLAUDE.md); bitstamp/coingecko aren't, so this stays reachable the same way
 * /api/btc/price already is.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const asset = ASSET_BY_ID[symbol];
  if (!asset || asset.assetClass !== "crypto") {
    return NextResponse.json({ error: "unknown or non-crypto symbol" }, { status: 404 });
  }

  const coingeckoId = COINGECKO_ID[symbol];
  for (const [name, fn] of [
    ["bitstamp", () => bitstamp(symbol)],
    ["coingecko", () => coingecko(coingeckoId)],
  ] as const) {
    try {
      const price = await fn();
      if (price > 0)
        return NextResponse.json(
          { source: name, price, ts: Date.now() },
          { headers: { "cache-control": "no-store" } },
        );
    } catch {
      /* try next */
    }
  }
  return NextResponse.json({ source: "none", price: 0, ts: Date.now() }, { status: 502 });
}
