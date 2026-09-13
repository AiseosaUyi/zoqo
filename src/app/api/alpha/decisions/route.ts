import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Recent accepted/rejected decisions feed, filterable by strategyId/venue/
 *  status/limit query params — all optional, mapped straight into
 *  service.listDecisions' filter object. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  if (status != null && status !== "accepted" && status !== "rejected") {
    return NextResponse.json({ error: 'status must be "accepted" or "rejected"' }, { status: 400 });
  }
  const limitParam = searchParams.get("limit");
  const limit = limitParam != null ? Number(limitParam) : undefined;
  if (limit != null && (!Number.isFinite(limit) || limit <= 0)) {
    return NextResponse.json({ error: "limit must be a positive number" }, { status: 400 });
  }

  const decisions = await service.listDecisions(supabase, user.id, {
    strategyId: searchParams.get("strategyId") ?? undefined,
    venue: searchParams.get("venue") ?? undefined,
    status: status ?? undefined,
    limit,
  });
  return NextResponse.json(decisions);
}
