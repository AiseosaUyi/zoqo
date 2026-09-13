import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";
import type { VenueId } from "@/lib/alpha/core/venue";
import type { CreateStrategyInput } from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Session-scoped CRUD over alpha_strategies. GET lists the caller's
 *  strategy instances; POST creates one from a registry template
 *  (service.createStrategy 404s — well, throws — on an unknown
 *  strategy_key, surfaced here as a 400 since that's a client input error,
 *  not a server fault). Per-id operations (update/run/pause/resume) live
 *  under ./[id]/. */

function isCreateInput(body: unknown): body is CreateStrategyInput {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.strategyKey === "string" &&
    typeof b.name === "string" &&
    typeof b.venue === "string" &&
    typeof b.budget === "number" &&
    typeof b.maxStake === "number" &&
    typeof b.dailyCap === "number" &&
    typeof b.dailyLossStop === "number"
  );
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const strategies = await service.listStrategies(supabase, user.id);
  return NextResponse.json(strategies);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!isCreateInput(body)) {
    return NextResponse.json(
      { error: "strategyKey, name, venue, budget, maxStake, dailyCap, dailyLossStop are required" },
      { status: 400 },
    );
  }

  try {
    const strategy = await service.createStrategy(supabase, user.id, { ...body, venue: body.venue as VenueId });
    return NextResponse.json(strategy);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "create failed" }, { status: 400 });
  }
}
