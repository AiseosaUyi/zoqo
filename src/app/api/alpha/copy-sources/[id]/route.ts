import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["candidate", "followed", "dropped", "blocked"]);

/** GET one source's metrics + recent fills + our copies (for the gap);
 *  PATCH confirms/drops/blocks it — the one human-confirmation step
 *  docs/alpha/08-copy-trading.md §2 requires before a candidate is
 *  actually followed. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await service.getCopySource(supabase, user.id, id);
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  if (!body || typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: `status must be one of ${[...VALID_STATUSES].join(", ")}` }, { status: 400 });
  }

  try {
    await service.setCopySourceStatus(supabase, user.id, id, body.status as "candidate" | "followed" | "dropped" | "blocked");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
