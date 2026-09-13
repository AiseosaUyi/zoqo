import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Applies one proposal's proposed params to its strategy and logs an
 *  `applied` event — see `service.ts`'s `applyProposal` for the ownership
 *  checks and the merge semantics. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await service.applyProposal(supabase, user.id, id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "apply failed" }, { status: 400 });
  }
}
