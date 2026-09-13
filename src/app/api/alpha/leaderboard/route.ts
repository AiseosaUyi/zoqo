import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Phase 1 stub leaderboard (raw n/pnl per strategy) — real ROI-CI/Brier/
 *  RPS/CLV/Sharpe metrics land in Phase 5, see service.getLeaderboard. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const leaderboard = await service.getLeaderboard(supabase, user.id);
  return NextResponse.json(leaderboard);
}
