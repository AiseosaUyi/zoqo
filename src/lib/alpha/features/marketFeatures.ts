import type { FeatureProvider } from "../core/strategy";
import type { MarketRef } from "../core/venue";

/** Market features for prediction-market-venue strategies (Manifold today;
 *  any future probability-denominated venue can reuse this shape). Unlike
 *  priceFeatures.ts, this doesn't own a persisted series table — it reads
 *  straight from the venue's own market payload each call, since that's
 *  the only place these fields live (no `alpha_market_links`-style
 *  cross-venue join yet — that's Phase 4, see phase-2-manifold.md's scope
 *  cut). Deliberately venue-agnostic in shape (a plain fetch by marketId),
 *  but Phase 2 only wires it up for `manifold` markets. */

const BASE = "https://api.manifold.markets";

interface ManifoldMarketPayload {
  probability?: number;
  closeTime?: number;
  volume?: number;
  volume24Hours?: number;
  totalLiquidity?: number;
  pool?: Record<string, number>;
  probChanges?: { day?: number; week?: number; month?: number };
}

async function fetchMarket(marketId: string, apiKey: string | null): Promise<ManifoldMarketPayload | null> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers["Authorization"] = `Key ${apiKey}`;
    const res = await fetch(`${BASE}/v0/market/${marketId}`, { headers });
    if (!res.ok) return null;
    return (await res.json()) as ManifoldMarketPayload;
  } catch {
    return null;
  }
}

/** Manifold has no literal order-book bid/ask, so "spread" is approximated
 *  as inversely proportional to pool liquidity: a thinly-liquid market
 *  moves further per unit traded, i.e. behaves like a wider spread. This is
 *  a coarse proxy, not a real spread — documented rather than invented as
 *  if it were authoritative. Returns 0 (not omitted) when liquidity is
 *  unknown or non-positive, since strategies compare this numerically. */
function approximateSpread(totalLiquidity: number | undefined): number {
  if (!totalLiquidity || totalLiquidity <= 0) return 0;
  // Calibrated so ~100 mana of liquidity ≈ 1% spread-equivalent, tapering
  // as liquidity grows — a shape, not a measured constant.
  return Math.min(0.5, 1 / (1 + totalLiquidity / 100));
}

export function createMarketFeatureProvider(apiKey: string | null, now: number): FeatureProvider {
  return {
    async getMarketFeatures(market: MarketRef) {
      const payload = await fetchMarket(market.marketId, apiKey);
      if (!payload || typeof payload.probability !== "number") return null;

      const timeToCloseMs = typeof payload.closeTime === "number" ? payload.closeTime - now : NaN;
      // Manifold's LiteMarket carries recent probability deltas under
      // `probChanges` for CPMM-1 binary markets (day/week/month) — use
      // whatever of those is actually present rather than deriving our own
      // momentum figure from scratch. Falls back to 0 (no signal) if the
      // market doesn't carry the field (e.g. non-CPMM mechanism).
      const momentum = payload.probChanges?.day ?? payload.probChanges?.week ?? 0;

      return {
        mid_prob: payload.probability,
        spread: approximateSpread(payload.totalLiquidity),
        volume_24h: payload.volume24Hours ?? 0,
        time_to_close_ms: Number.isFinite(timeToCloseMs) ? timeToCloseMs : Number.POSITIVE_INFINITY,
        momentum,
      };
    },
  };
}
