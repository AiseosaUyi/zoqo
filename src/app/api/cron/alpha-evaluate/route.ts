import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { evaluateStrategies } from "@/lib/alpha/evaluate";
import { runParamSearch } from "@/lib/alpha/paramSearch";
import { getStrategyTemplate } from "@/lib/alpha/strategies";

export const dynamic = "force-dynamic";

/** Nightly evaluator (docs/alpha/03-architecture.md §6, §7 Levels 2/3) —
 *  pg_cron hits this at 02:15 UTC. Phase 5: `evaluateStrategies` now writes
 *  the full ROI-CI/Brier/RPS/CLV/drawdown/Sharpe scoring and reallocates
 *  budget (see evaluate.ts). This route also runs Level 4's weekly
 *  walk-forward param search for every strategy whose template declares a
 *  `paramSpace`, gated to one day of the week — same day-of-week-gate
 *  pattern `alpha-ingest/route.ts` already uses for its weekly Dixon-Coles
 *  refit, mirrored here rather than reinvented. */
const WEEKLY_PARAM_SEARCH_DAY_UTC = 3; // Wednesday — arbitrary, just needs to be once/week and off the evaluator's own daily critical path

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleClient();
  const result = await evaluateStrategies(supabase);

  const paramSearch = { ran: false as boolean, proposed: 0, checked: 0 };
  if (new Date().getUTCDay() === WEEKLY_PARAM_SEARCH_DAY_UTC) {
    paramSearch.ran = true;
    const { data: strategies } = await supabase.from("alpha_strategies").select("id, strategy_key");
    for (const strategy of strategies ?? []) {
      const template = getStrategyTemplate(strategy.strategy_key);
      if (!template?.paramSpace || Object.keys(template.paramSpace).length === 0) continue;
      paramSearch.checked++;
      const outcome = await runParamSearch(supabase, strategy.id);
      if (outcome.proposed) paramSearch.proposed++;
    }
  }

  return NextResponse.json({ ok: true, ...result, paramSearch });
}
