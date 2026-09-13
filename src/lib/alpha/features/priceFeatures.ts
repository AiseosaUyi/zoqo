import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { FeatureProvider } from "../core/strategy";

/** Price features for terminal-venue strategies (docs/alpha/03-architecture.md
 *  §4). Reads the same `price_history` table `evaluate-triggers` writes to —
 *  no second price series. Phase 1 scope only: returns, a fast/slow moving
 *  average pair, and a simple ATR proxy. Forex/gold session flags and RSI
 *  are TODOs for whichever later phase's strategy actually needs them
 *  (YAGNI — Phase 1's two strategies don't). */

interface PricePoint {
  price: number;
  ts: number;
}

async function readSeries(supabase: SupabaseClient<Database>, assetId: string, limit = 1000): Promise<PricePoint[]> {
  const { data } = await supabase
    .from("price_history")
    .select("price, ts")
    .eq("asset_id", assetId)
    .order("ts", { ascending: true })
    .limit(limit);
  return (data ?? []).map((r) => ({ price: r.price, ts: new Date(r.ts).getTime() }));
}

function average(points: PricePoint[]): number {
  return points.reduce((sum, p) => sum + p.price, 0) / points.length;
}

/** True Range proxy from a price-only series (no OHLC bars exist here) —
 *  average absolute tick-to-tick change over the window, a coarser stand-in
 *  for ATR that's honest about what a single price feed can actually give. */
function priceOnlyAtr(points: PricePoint[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.abs(points[i].price - points[i - 1].price);
  return sum / (points.length - 1);
}

function returnOverWindow(points: PricePoint[], windowMs: number, now: number): number | null {
  const cutoff = now - windowMs;
  const past = [...points].reverse().find((p) => p.ts <= cutoff);
  if (!past || past.price === 0) return null;
  const latest = points[points.length - 1];
  return (latest.price - past.price) / past.price;
}

export function createPriceFeatureProvider(supabase: SupabaseClient<Database>, now: number): FeatureProvider {
  return {
    async getPriceSeries(assetId: string) {
      const series = await readSeries(supabase, assetId);
      return series.length === 0 ? null : series;
    },

    async getPriceFeatures(assetId: string) {
      const series = await readSeries(supabase, assetId);
      if (series.length === 0) return null;
      const latest = series[series.length - 1];
      const fastWindow = series.slice(-12); // ~12 most recent ticks as the "fast" MA
      const slowWindow = series.slice(-48); // ~48 ticks as the "slow" MA
      return {
        price: latest.price,
        ma_fast: average(fastWindow),
        ma_slow: average(slowWindow),
        atr: priceOnlyAtr(series.slice(-48)),
        return_4h: returnOverWindow(series, 4 * 60 * 60 * 1000, now) ?? 0,
        sample_size: series.length,
      };
    },
  };
}
