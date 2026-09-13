import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Static strategy registry data (src/lib/alpha/strategies/index.ts) — no
 *  per-user row is read, but this still gates on a signed-in session for
 *  consistency with every other /api/alpha/* route rather than carving out
 *  a public exception. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json(service.listStrategyTemplates());
}
