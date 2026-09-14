import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { VenueId } from "./core/venue";
import type { FeatureProvider, StrategyCtx } from "./core/strategy";
import { getStrategyTemplate } from "./strategies";
import { createVenueAdapter } from "./venues";
import { createPriceFeatureProvider } from "./features/priceFeatures";
import { createMarketFeatureProvider } from "./features/marketFeatures";
import { createFixtureFeatureProvider } from "./features/fixtureFeatures";
import { getVenueSecret } from "./secrets";
import { getRiskContext, executeIntent } from "./service";

/** The runner (docs/alpha/03-architecture.md §6). One function,
 *  `runDueStrategies`, is the single caller of `Strategy.evaluate()` in the
 *  whole program — the `/api/cron/alpha-run` route (the scheduler) and
 *  `/api/alpha/strategies/[id]/run` (a human's "Run now", and later an MCP
 *  `run_strategy_now`) both just set `next_run_at = now()` and let the next
 *  tick of this same function pick it up, so there is exactly one runner
 *  regardless of which door triggered it. */

const RUN_BATCH_LIMIT = 10;
type Client = SupabaseClient<Database>;

type StrategyRow = Database["public"]["Tables"]["alpha_strategies"]["Row"];

function computeNextRunAt(schedule: unknown, now: number): string {
  const s = schedule as { kind?: string; everyMin?: number };
  if (s?.kind === "interval" && typeof s.everyMin === "number" && s.everyMin > 0) {
    return new Date(now + s.everyMin * 60_000).toISOString();
  }
  // Cron-expression and event schedules aren't implemented until a later
  // phase needs them (Phase 1 strategies are both `interval`) — push an
  // unimplemented-schedule row out an hour so it can't spin-loop the
  // runner, and runOneStrategy logs why nothing happened.
  return new Date(now + 60 * 60_000).toISOString();
}

async function finishRun(
  supabase: Client,
  runId: string,
  patch: { intents?: number; accepted?: number; rejected?: number; error?: string; log?: unknown[] },
) {
  await supabase
    .from("alpha_runs")
    .update({
      finished_at: new Date().toISOString(),
      intents: patch.intents ?? 0,
      accepted: patch.accepted ?? 0,
      rejected: patch.rejected ?? 0,
      error: patch.error ?? null,
      log: (patch.log ?? []) as never,
    })
    .eq("id", runId);
}

async function runOneStrategy(
  supabase: Client,
  strategyRow: StrategyRow,
  trigger: "schedule" | "manual" | "mcp" | "event",
  now: number,
): Promise<{ strategyId: string; intents?: number; accepted?: number; rejected?: number; error?: string }> {
  const { data: run } = await supabase
    .from("alpha_runs")
    .insert({ strategy_id: strategyRow.id, trigger })
    .select("*")
    .single();
  if (!run) return { strategyId: strategyRow.id, error: "failed to create alpha_runs row" };

  const log: unknown[] = [];
  const logFn = (msg: string, data?: unknown) => log.push({ msg, data, ts: Date.now() });

  const template = getStrategyTemplate(strategyRow.strategy_key);
  if (!template) {
    const error = `unknown strategy_key "${strategyRow.strategy_key}"`;
    await finishRun(supabase, run.id, { error, log });
    return { strategyId: strategyRow.id, error };
  }

  let venue;
  try {
    venue = createVenueAdapter(strategyRow.venue as VenueId, supabase, strategyRow.user_id);
  } catch (e) {
    const error = (e as Error).message;
    await finishRun(supabase, run.id, { error, log });
    return { strategyId: strategyRow.id, error };
  }

  // Price features are always available; market features (Manifold's
  // probability/liquidity/close-time shape) and fixture features (football,
  // Phase 3) are layered in only for venues that have them, keyed off the
  // same getVenueSecret() path the adapter itself uses (see manifold.ts's
  // header for why this stays a per-call lookup instead of threading an
  // async key through more of the call chain).
  const priceFeatures = createPriceFeatureProvider(supabase, now);
  let features: FeatureProvider = priceFeatures;
  if (strategyRow.venue === "manifold") {
    const apiKey = await getVenueSecret(strategyRow.user_id, "manifold");
    const marketFeatures = createMarketFeatureProvider(apiKey, now);
    features = { ...priceFeatures, getMarketFeatures: marketFeatures.getMarketFeatures };
  } else if (strategyRow.venue === "zoqo-sportsbook") {
    const fixtureFeatures = createFixtureFeatureProvider(supabase, now);
    features = { ...priceFeatures, getFixtureFeatures: fixtureFeatures.getFixtureFeatures };
  }
  const ctx: StrategyCtx = {
    userId: strategyRow.user_id,
    now,
    venue,
    budget: { available: strategyRow.budget, currency: venue.currency },
    features,
    quotes: (m) => venue.getQuote(m),
    params: (strategyRow.params ?? {}) as Record<string, unknown>,
    log: logFn,
    supabase,
  };

  let intents;
  try {
    intents = await template.evaluate(ctx);
  } catch (e) {
    const error = `evaluate() threw: ${(e as Error).message}`;
    await finishRun(supabase, run.id, { error, log });
    return { strategyId: strategyRow.id, error };
  }

  const riskCtx = await getRiskContext(supabase, strategyRow, now);

  let accepted = 0;
  let rejected = 0;
  for (const intent of intents) {
    intent.strategyId = strategyRow.id;
    const outcome = await executeIntent(
      supabase,
      strategyRow.user_id,
      strategyRow.venue as VenueId,
      venue,
      intent,
      riskCtx,
      now,
      run.id,
      (message) => logFn("place() threw", { error: message }),
    );
    if (outcome.accepted) accepted++;
    else rejected++;
  }

  await finishRun(supabase, run.id, { intents: intents.length, accepted, rejected, log });
  return { strategyId: strategyRow.id, intents: intents.length, accepted, rejected };
}

export async function runDueStrategies(supabase: Client, trigger: "schedule" | "manual" | "mcp" | "event" = "schedule") {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: candidates } = await supabase.from("alpha_strategies").select("*").eq("enabled", true).lte("next_run_at", nowIso).limit(RUN_BATCH_LIMIT);
  if (!candidates || candidates.length === 0) return { claimed: 0, results: [] };

  const results = [];
  for (const row of candidates) {
    const nextRunAt = computeNextRunAt(row.schedule, now);
    // A plain UPDATE ... WHERE next_run_at <= now() is already race-safe
    // across overlapping invocations: Postgres locks the row for the
    // duration of this statement, so a second concurrent runner's UPDATE
    // blocks until this one commits, then re-evaluates its own WHERE
    // clause against the now-future next_run_at and matches nothing.
    const { data: claimedRows } = await supabase
      .from("alpha_strategies")
      .update({ next_run_at: nextRunAt, last_run_at: nowIso })
      .eq("id", row.id)
      .lte("next_run_at", nowIso)
      .select("*");
    const claimed = claimedRows?.[0];
    if (!claimed) continue; // lost the race to another invocation
    results.push(await runOneStrategy(supabase, claimed, trigger, now));
  }
  return { claimed: results.length, results };
}
