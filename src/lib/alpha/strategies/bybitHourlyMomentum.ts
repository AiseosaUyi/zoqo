import type { Strategy } from "../core/strategy";
import { computeMomentumSignal } from "./lib/momentum";

/** Bybit's version of `terminalHourlyMomentum.ts` — same "trailing-window
 *  return sign + ATR stop" logic, now shared via `./lib/momentum.ts`
 *  (factored out specifically because this file became its second
 *  consumer; see that module's header and the phase-4 plan's DRY note).
 *
 *  FEATURE SCOPE-DOWN (documented, per this phase's own build prompt):
 *  `priceFeatures.ts`'s `getPriceFeatures(assetId)` reads generically from
 *  `price_history` keyed by `asset_id` — it has no idea whether that id is
 *  a zoqo-terminal asset ("BTC") or a Bybit symbol ("BTCUSDT"), so in
 *  principle this strategy could reuse it unchanged IF something ever
 *  ingests Bybit prices into `price_history` under the Bybit symbol. As of
 *  Phase 4, nothing does — `evaluate-triggers` only writes `ASSET_BY_ID`'s
 *  own terminal assets there. Rather than build a full Bybit-specific
 *  feature provider (its own persisted series, its own ingest job) just for
 *  this one strategy, this is intentionally left as a scope-down: when no
 *  price history exists for `params.assetId`, this strategy fetches a
 *  single live quote (to confirm the venue/symbol are reachable and to give
 *  an operator something to look at in the run log) and returns no
 *  intents — a lone point-in-time quote cannot produce a "return over a
 *  window" signal, and fabricating one from it would be dishonest. Once a
 *  Bybit price-history ingest exists, this file needs no changes to start
 *  producing real signals. */

interface Params extends Record<string, unknown> {
  assetId: string;
  everyMin: number;
  atrMultiple: number;
  stakePct: number;
  minReturnAbs: number;
}

const DEFAULT_PARAMS: Params = {
  assetId: "BTCUSDT",
  everyMin: 60,
  atrMultiple: 2,
  stakePct: 0.1,
  minReturnAbs: 0.002,
};

export const bybitHourlyMomentum: Strategy = {
  key: "bybit-hourly-momentum",
  venues: ["bybit-demo"],
  schedule: { kind: "interval", everyMin: DEFAULT_PARAMS.everyMin },
  defaultParams: DEFAULT_PARAMS,

  async evaluate(ctx) {
    const params = { ...DEFAULT_PARAMS, ...(ctx.params as Partial<Params>) };
    const features = ctx.features.getPriceFeatures ? await ctx.features.getPriceFeatures(params.assetId) : null;

    if (!features) {
      // See module header's FEATURE SCOPE-DOWN note: no persisted series
      // for this assetId yet, so there's no window to compute a return
      // over. Fetch a quote purely to confirm reachability/log it.
      const quote = await ctx.venue.getQuote({ venue: "bybit-demo", marketId: params.assetId });
      ctx.log("no persisted price history for asset; scope-down to quote-only, no signal this run", { assetId: params.assetId, last: quote?.last ?? null });
      return [];
    }

    const price = Number(features.price);
    const atr = Number(features.atr);
    const return4h = Number(features.return_4h);

    const signal = computeMomentumSignal({ price, atr, returnOverWindow: return4h, atrMultiple: params.atrMultiple, minReturnAbs: params.minReturnAbs });
    if (!signal) {
      ctx.log("no momentum signal (bad inputs or below noise threshold)", { price, return4h, minReturnAbs: params.minReturnAbs });
      return [];
    }

    return [
      {
        strategyId: "",
        market: { venue: "bybit-demo", marketId: params.assetId },
        side: signal.side,
        kind: "market",
        edge: signal.edge,
        suggestedStakePct: params.stakePct,
        stopLoss: signal.stopLoss,
        rationale: `Hourly momentum (Bybit): 4h return ${(return4h * 100).toFixed(2)}%, ATR stop at ${signal.stopLoss.toFixed(2)}`,
        features: { price, atr, return4h },
      },
    ];
  },
};
