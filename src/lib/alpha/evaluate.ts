import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** `/api/cron/alpha-evaluate` calls `evaluateStrategies` nightly. Phase 1
 *  stub, explicit about what it is NOT: it writes today's `n` (orders
 *  settled today) and `pnl_today`/`pnl_total` (running total) only —
 *  `roi`/`roi_ci_low`/`roi_ci_high`/`hit_rate`/`brier`/`rps`/`clv`/
 *  `max_drawdown`/`sharpe` are left null. Those are docs/alpha/03-
 *  architecture.md §7's Level 2 scoring and land in Phase 5 alongside the
 *  budget-reallocation rule that reads them — writing fabricated numbers
 *  here instead of nulls would be worse than not having them yet. */

type Client = SupabaseClient<Database>;

function todayDate(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD, matches alpha_strategy_stats.day
}

function dayStartIso(now: number): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function evaluateStrategies(supabase: Client, now: number = Date.now()) {
  const { data: strategies } = await supabase.from("alpha_strategies").select("id, budget");
  if (!strategies || strategies.length === 0) return { evaluated: 0 };

  const day = todayDate(now);
  const dayStart = dayStartIso(now);
  let evaluated = 0;

  for (const strategy of strategies) {
    const { data: decisionsToday } = await supabase
      .from("alpha_decisions")
      .select("id")
      .eq("strategy_id", strategy.id)
      .eq("status", "accepted")
      .gte("decided_at", dayStart);
    const decisionIds = (decisionsToday ?? []).map((d) => d.id);

    let pnlToday = 0;
    let n = 0;
    if (decisionIds.length > 0) {
      const { data: settledToday } = await supabase
        .from("alpha_orders")
        .select("pnl")
        .in("decision_id", decisionIds)
        .eq("status", "settled")
        .gte("settled_at", dayStart);
      n = (settledToday ?? []).length;
      pnlToday = (settledToday ?? []).reduce((sum, o) => sum + (o.pnl ?? 0), 0);
    }

    const { data: priorStats } = await supabase
      .from("alpha_strategy_stats")
      .select("pnl_total")
      .eq("strategy_id", strategy.id)
      .lt("day", day)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pnlTotal = (priorStats?.pnl_total ?? 0) + pnlToday;

    await supabase.from("alpha_strategy_stats").upsert(
      {
        strategy_id: strategy.id,
        day,
        n,
        pnl_today: pnlToday,
        pnl_total: pnlTotal,
        budget_after: strategy.budget, // Phase 5 reallocates; unchanged here
      },
      { onConflict: "strategy_id,day" },
    );
    evaluated++;
  }

  return { evaluated };
}
