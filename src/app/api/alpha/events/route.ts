import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Recent alpha_events feed (kill/paused/resumed/rejection notices, etc).
 *  Per-event acknowledge is ./[id]/ack. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam != null ? Number(limitParam) : undefined;
  if (limit != null && (!Number.isFinite(limit) || limit <= 0)) {
    return NextResponse.json({ error: "limit must be a positive number" }, { status: 400 });
  }

  const kindsParam = searchParams.get("kinds");
  const events = await service.listEvents(supabase, user.id, {
    since: searchParams.get("since") ?? undefined,
    limit,
    kinds: kindsParam ? kindsParam.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
    unacknowledgedOnly: searchParams.get("unacknowledged") === "1",
  });
  return NextResponse.json(events);
}
