import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { settleOpenOrders } from "@/lib/alpha/settle";

export const dynamic = "force-dynamic";

/** Settlement pass (docs/alpha/03-architecture.md §6) — pg_cron hits this
 *  every 5 minutes. Separate from alpha-run: a strategy's evaluate() only
 *  ever produces intents, never resolves them. */
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
  const result = await settleOpenOrders(supabase);
  return NextResponse.json({ ok: true, ...result });
}
