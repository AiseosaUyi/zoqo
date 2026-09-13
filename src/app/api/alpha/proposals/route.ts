import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Unacknowledged `kind='proposal'` alpha_events — the "/alpha" proposals
 *  inbox's list endpoint. Apply/dismiss live at ./[id]/apply and
 *  ./[id]/dismiss. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const proposals = await service.listProposals(supabase, user.id);
  return NextResponse.json(proposals);
}
