import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Disables a strategy and logs an `alpha_events` "paused" row (unlike a
 *  plain PATCH { enabled: false }, which wouldn't log anything). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  if (body.reason != null && typeof body.reason !== "string") {
    return NextResponse.json({ error: "reason must be a string" }, { status: 400 });
  }

  await service.pauseStrategy(supabase, user.id, id, body.reason as string | undefined);
  return NextResponse.json({ ok: true });
}
