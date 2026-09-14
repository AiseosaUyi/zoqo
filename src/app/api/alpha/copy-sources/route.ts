import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** `/alpha`'s copy-sources tab (docs/alpha/08-copy-trading.md §9). GET lists
 *  the signed-in user's sources; POST runs the screen now (same function
 *  MCP's `propose_copy_sources` calls). Per-source detail and status
 *  changes live at ./[id]. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sources = await service.listCopySources(supabase, user.id, {
    venue: searchParams.get("venue") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  });
  return NextResponse.json(sources);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { venue?: unknown; candidateRefs?: unknown } | null;
  if (!body || (body.venue !== "polymarket-sim" && body.venue !== "manifold")) {
    return NextResponse.json({ error: 'venue must be "polymarket-sim" or "manifold"' }, { status: 400 });
  }
  const candidateRefs = Array.isArray(body.candidateRefs) ? body.candidateRefs.filter((r): r is string => typeof r === "string") : undefined;

  try {
    const result = await service.proposeCopySources(supabase, user.id, body.venue, candidateRefs);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
