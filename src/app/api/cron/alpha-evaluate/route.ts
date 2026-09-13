import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { evaluateStrategies } from "@/lib/alpha/evaluate";

export const dynamic = "force-dynamic";

/** Nightly evaluator (docs/alpha/03-architecture.md §6, §7) — pg_cron hits
 *  this at 02:15 UTC. Phase 1: writes raw n/pnl only (see evaluate.ts's
 *  header for what's deliberately null until Phase 5). */
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
  return NextResponse.json({ ok: true, ...result });
}
