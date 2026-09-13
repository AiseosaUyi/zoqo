import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { VenueId } from "./core/venue";
import type { StrategyCtx } from "./core/strategy";
import { evaluateIntent } from "./risk";
import { getStrategyTemplate } from "./strategies";
import { createVenueAdapter } from "./venues";
import { createPriceFeatureProvider } from "./features/priceFeatures";
import { getRiskContext, recordVenueSpend } from "./service";

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

  const features = createPriceFeatureProvider(supabase, now);
  const ctx: StrategyCtx = {
    userId: strategyRow.user_id,
    now,
    venue,
    budget: { available: strategyRow.budget, currency: venue.currency },
    features,
    quotes: (m) => venue.getQuote(m),
    params: (strategyRow.params ?? {}) as Record<string, unknown>,
    log: logFn,
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
    const decimalOddsForSizing = intent.marketProb && intent.marketProb > 0 && intent.marketProb < 1 ? 1 / intent.marketProb : undefined;

    const result = evaluateIntent({
      intent,
      now,
      killSwitch: riskCtx.killSwitch,
      strategy: riskCtx.strategy,
      venue: riskCtx.venue,
      decimalOddsForSizing,
    });

    const { data: decision } = await supabase
      .from("alpha_decisions")
      .insert({
        user_id: strategyRow.user_id,
        strategy_id: strategyRow.id,
        run_id: run.id,
        venue: strategyRow.venue,
        market_id: intent.market.marketId,
        outcome_id: intent.market.outcomeId ?? null,
        side: intent.side,
        status: result.accepted ? "accepted" : "rejected",
        reject_reason: result.accepted ? null : result.reason,
        edge: intent.edge,
        model_prob: intent.modelProb ?? null,
        market_prob: intent.marketProb ?? null,
        price_or_odds: decimalOddsForSizing ?? null,
        stake: result.accepted ? result.stake : null,
        currency: venue.currency,
        rationale: intent.rationale,
        features: (intent.features ?? null) as never,
      })
      .select("*")
      .single();

    if (!result.accepted || !decision) {
      rejected++;
      continue;
    }

    let placed;
    try {
      placed = await venue.place(intent, result.stake, { userId: strategyRow.user_id, now });
    } catch (e) {
      logFn("place() threw", { error: (e as Error).message });
      rejected++;
      continue;
    }
    if (placed.status === "rejected" || !placed.venueOrderId) {
      rejected++;
      continue;
    }
    accepted++;

    await supabase.from("alpha_orders").insert({
      decision_id: decision.id,
      user_id: strategyRow.user_id,
      venue: strategyRow.venue,
      venue_order_id: placed.venueOrderId,
      market_id: intent.market.marketId,
      outcome_id: intent.market.outcomeId ?? null,
      side: placed.side,
      kind: intent.kind,
      stake: placed.stake,
      currency: placed.currency,
      price_or_odds: placed.priceOrOdds,
      status: placed.status,
    });
    await recordVenueSpend(supabase, strategyRow.user_id, strategyRow.venue as VenueId, placed.stake);
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
