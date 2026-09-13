import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Session-scoped read of `service.getHealth` — same function the `get_health`
 *  MCP tool wraps (docs/alpha/05-mcp-spec.md), so `/alpha`'s needs-setup panel
 *  and an MCP agent see identical scheduler/rate-budget/credential status. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const health = await service.getHealth(supabase, user.id);
  return NextResponse.json(health);
}
