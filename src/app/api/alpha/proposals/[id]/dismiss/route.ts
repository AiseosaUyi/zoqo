import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Dismisses a proposal without applying it — marks it acknowledged only. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await service.dismissProposal(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "dismiss failed" }, { status: 400 });
  }
}
