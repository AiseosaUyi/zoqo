import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runDueStrategies } from "@/lib/alpha/runner";

export const dynamic = "force-dynamic";

/** Scheduler entry point (docs/alpha/03-architecture.md §6) — pg_cron hits
 *  this once a minute (see supabase/alpha-cron-apply.sql.example); a
 *  human's "Run now" and (Phase 2) an MCP `run_strategy_now` don't call
 *  this route directly, they set `next_run_at = now()` and let this same
 *  tick pick it up, so there is exactly one runner. Same
 *  Authorization-header auth as the existing evaluate-triggers route — no
 *  user session, since a scheduler tick isn't scoped to one user. */
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
  const result = await runDueStrategies(supabase, "schedule");
  return NextResponse.json({ ok: true, ...result });
}
