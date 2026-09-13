import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

type StrategyUpdate = Database["public"]["Tables"]["alpha_strategies"]["Update"];

// Columns a client is allowed to PATCH directly — id/user_id/strategy_key/
// created_at are immutable from this door (strategy_key would silently
// desync params from the registry template; use pause/resume for `enabled`
// so events get logged, not this route).
const PATCHABLE_KEYS = new Set<keyof StrategyUpdate>([
  "name",
  "venue",
  "params",
  "schedule",
  "budget",
  "budget_floor",
  "max_stake",
  "daily_cap",
  "daily_loss_stop",
  "kelly_fraction",
  "min_edge",
  "max_odds",
  "cooldown_min",
]);

/** PATCH edits a strategy instance's tunables (budget/caps/params/schedule).
 *  Next.js 15+/16 route handlers: dynamic segment params are async
 *  (`Promise<{ id: string }>`), not the old sync shape. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const patch: StrategyUpdate = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (!PATCHABLE_KEYS.has(key as keyof StrategyUpdate)) {
      return NextResponse.json({ error: `field "${key}" is not editable via this route` }, { status: 400 });
    }
    (patch as Record<string, unknown>)[key] = value;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no editable fields in body" }, { status: 400 });
  }

  try {
    await service.updateStrategy(supabase, user.id, id, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "update failed" }, { status: 400 });
  }
}
