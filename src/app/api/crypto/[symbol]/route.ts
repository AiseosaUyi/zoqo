import { NextRequest, NextResponse } from "next/server";
import { ASSET_BY_ID } from "@/lib/assets";
import { getCryptoPrice } from "@/lib/serverPriceFeed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Server-side polling fallback for crypto in the Terminal — plays the same
 * role /api/btc/price plays for the prediction market's useBtc.ts. Routes
 * through the server (not a direct client-side REST call) because Binance/
 * Coinbase are DNS-blocked in many local/sandboxed environments (see
 * CLAUDE.md); bitstamp/coingecko aren't, so this stays reachable the same way
 * /api/btc/price already is. Fetch logic itself lives in
 * src/lib/serverPriceFeed.ts, shared with the Phase C cron trigger evaluator.
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

  const result = await getCryptoPrice(symbol);
  if (result) {
    return NextResponse.json(
      { source: result.source, price: result.price, ts: Date.now() },
      { headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json({ source: "none", price: 0, ts: Date.now() }, { status: 502 });
}
