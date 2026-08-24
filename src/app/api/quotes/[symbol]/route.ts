import { NextRequest, NextResponse } from "next/server";
import { ASSET_BY_ID } from "@/lib/assets";
import { getQuotePrice } from "@/lib/serverPriceFeed";

export const dynamic = "force-dynamic";

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
 * presented as real). Fetch logic itself lives in src/lib/serverPriceFeed.ts,
 * shared with the Phase C cron trigger evaluator.
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

  const result = await getQuotePrice(symbol);
  if (!result) return NextResponse.json({ error: "unknown symbol" }, { status: 404 });
  return NextResponse.json({ price: result.price, source: result.source, ts: Date.now(), mock: result.mock ?? false });
}
