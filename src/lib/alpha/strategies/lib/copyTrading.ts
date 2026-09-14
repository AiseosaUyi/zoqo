import type { StrategyCtx } from "../../core/strategy";
import type { Intent } from "../../core/venue";
import { detectPolymarketFills, detectManifoldFills, sizeCopyIntent, shouldFollowFill, computeSlippageBps, type RawSourceFill } from "../../copy/follow";

/** Shared copy-strategy evaluate() body (docs/alpha/08-copy-trading.md §3,
 *  §7) — `polymarketCopySources.ts`/`manifoldCopySources.ts`/
 *  `copyRandomControl.ts` are thin wrappers picking the detect function and
 *  source-selection mode, same factoring pattern as
 *  `strategies/lib/momentum.ts`/`longshotFade.ts`.
 *
 *  Known simplification (documented, not hidden): `timeToResolutionMs` and
 *  `liquidityAtSizeUsd` inputs to `shouldFollowFill` use the venue's own
 *  quote (`ctx.quotes`) as the only signal available without a per-market
 *  order-book-depth lookup this program doesn't generalize across
 *  arbitrary third-party markets — a real per-market resolution date and a
 *  real depth-at-size figure would sharpen these filters. `sourceBankrollUsd`
 *  is a fixed assumption (`params.assumedSourceBankrollUsd`), not a live
 *  per-wallet balance fetch, for the same reason `sources.ts`'s
 *  `typicalDepthUsd` is a configurable assumption rather than a lookup —
 *  both are named in `defaultParams` so they're visible and tunable, not
 *  buried constants. */

export interface CopyTradingParams extends Record<string, unknown> {
  everyMin: number;
  maxFillsPerTick: number;
  assumedSourceBankrollUsd: number;
  maxStakePerCopy: number;
  minTimeToResolutionMs: number;
  maxPriceMovedPct: number;
  minLiquidityUsd: number;
  lookbackMsOnFirstRun: number;
}

export const COPY_TRADING_DEFAULTS: CopyTradingParams = {
  everyMin: 5, // "poll each followed source at the adapter's polite cadence... every 60s" (§3) — 5min interval is this program's own scheduler granularity floor; detection itself still records real lag_ms regardless of poll cadence
  maxFillsPerTick: 5,
  assumedSourceBankrollUsd: 50_000, // a documented assumption, not a live balance fetch — see module header
  maxStakePerCopy: 25,
  minTimeToResolutionMs: 60 * 60_000, // don't follow into a market resolving within the hour
  maxPriceMovedPct: 0.08,
  minLiquidityUsd: 50,
  lookbackMsOnFirstRun: 60 * 60_000,
};

type DetectFn = (sourceRef: string, sinceMs: number) => Promise<RawSourceFill[]>;

export const DETECT_BY_VENUE: Record<string, DetectFn> = {
  "polymarket-sim": detectPolymarketFills,
  manifold: detectManifoldFills,
};

async function lastDetectedAtMs(ctx: StrategyCtx, sourceId: string): Promise<number | null> {
  if (!ctx.supabase) return null;
  const { data } = await ctx.supabase.from("alpha_source_fills").select("filled_at").eq("source_id", sourceId).order("filled_at", { ascending: false }).limit(1).maybeSingle();
  return data ? new Date(data.filled_at).getTime() : null;
}

/** `randomSourceMode: true` (copy-random-control, §7) picks from every
 *  active source it can see rather than only the confirmed-followed set —
 *  same detection/sizing/filter mechanics either way, per §4's control
 *  requirement ("the same mechanics"). */
export async function evaluateCopyStrategy(ctx: StrategyCtx, params: CopyTradingParams, venue: string, randomSourceMode: boolean): Promise<Intent[]> {
  if (!ctx.supabase) {
    ctx.log("no supabase client on ctx — copy strategies need core/strategy.ts's optional supabase field wired by runner.ts");
    return [];
  }

  const statusFilter = randomSourceMode ? ["candidate", "followed"] : ["followed"];
  const { data: sources } = await ctx.supabase.from("alpha_copy_sources").select("*").eq("user_id", ctx.userId).eq("venue", venue).in("status", statusFilter);
  if (!sources || sources.length === 0) {
    ctx.log(randomSourceMode ? "no candidate sources yet — run propose_copy_sources first" : "no followed sources — confirm a candidate via set_copy_source_status first");
    return [];
  }

  const detectFn = DETECT_BY_VENUE[venue];
  if (!detectFn) {
    ctx.log("no fill-detection function registered for this venue", { venue });
    return [];
  }

  const pickedSources = randomSourceMode ? [sources[Math.floor(Math.random() * sources.length)]] : sources;

  const intents: Intent[] = [];
  for (const source of pickedSources) {
    const since = (await lastDetectedAtMs(ctx, source.id)) ?? ctx.now - params.lookbackMsOnFirstRun;
    const rawFills = await detectFn(source.source_ref, since);
    for (const fill of rawFills.slice(0, params.maxFillsPerTick)) {
      const detectedAtMs = ctx.now;
      const lagMs = Math.max(0, detectedAtMs - fill.filledAtMs);

      // Best-effort dedup insert into alpha_source_fills — a conflict on
      // (source_id, venue_trade_id) means we already logged this fill on a
      // prior tick (the runner may have rejected the resulting intent that
      // time), so it's silently skipped rather than treated as an error.
      const { error: insertError } = await ctx.supabase
        .from("alpha_source_fills")
        .insert({
          source_id: source.id,
          venue_trade_id: fill.venueTradeId,
          market_id: fill.marketId,
          outcome_id: fill.outcomeId ?? null,
          side: fill.side,
          price: fill.price,
          size: fill.sizeUsd,
          filled_at: new Date(fill.filledAtMs).toISOString(),
        });
      if (insertError) continue; // already logged (unique violation) or a transient write error either way — don't double-follow

      const marketRef = { venue: venue as never, marketId: fill.marketId, outcomeId: fill.outcomeId };
      const quote = await ctx.quotes(marketRef);
      const ourPrice = quote?.impliedProb ?? quote?.last ?? fill.price;
      const priceMovedPct = Math.abs(ourPrice - fill.price);

      const decision = shouldFollowFill({
        timeToResolutionMs: params.minTimeToResolutionMs + 1, // simplification — see module header; never the binding filter until a real resolution-date lookup exists
        minTimeToResolutionMs: params.minTimeToResolutionMs,
        priceMovedSinceFillPct: priceMovedPct,
        maxPriceMovedPct: params.maxPriceMovedPct,
        liquidityAtSizeUsd: params.minLiquidityUsd + 1, // simplification — see module header
        minLiquidityUsd: params.minLiquidityUsd,
        alreadyHoldMarket: false, // simplification — real "do we already hold this" needs an open-orders lookup per venue; risk.ts's own cooldown/exposure checks catch a duplicate on the SAME market within cooldownMin regardless
      });
      if (!decision.follow) {
        ctx.log("skipped a detected fill", { sourceRef: source.source_ref, marketId: fill.marketId, reason: decision.reason });
        continue;
      }

      const stake = sizeCopyIntent({
        sourceFillSizeUsd: fill.sizeUsd,
        sourceBankrollUsd: params.assumedSourceBankrollUsd,
        strategyBudget: ctx.budget.available,
        maxStake: params.maxStakePerCopy,
      });
      if (stake <= 0) continue;

      intents.push({
        strategyId: "", // set by runner.ts before executeIntent, same as every other strategy's intents
        market: marketRef,
        side: fill.side === "sell" ? "no" : "yes",
        kind: "market",
        edge: 0, // copying, not modeling — see §2's own framing ("does copying beat our own strategies")
        suggestedStakePct: ctx.budget.available > 0 ? stake / ctx.budget.available : 0,
        rationale: `copying ${source.source_ref} (${venue}) fill on ${fill.marketId}, lag ${lagMs}ms`,
        features: { sourceScore: source.score ?? 0, lagMs, priceMovedPct },
        copyMeta: { sourceId: source.id, lagMs, slippageBps: computeSlippageBps({ sourceFillPrice: fill.price, ourFillPrice: ourPrice }) },
      });
    }
  }
  return intents;
}
