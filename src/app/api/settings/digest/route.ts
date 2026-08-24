import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The one per-user toggle for the daily digest email (settings page) —
 *  deliberately its own tiny endpoint rather than threaded through the full
 *  ProfileRecord/dataStore sync loop profile.tsx owns, since it's a single
 *  boolean with no bearing on the wallet/academy/terminal state that loop
 *  actually manages. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase.from("profiles").select("digest_opt_in").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ optIn: data?.digest_opt_in ?? true });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { optIn } = (await req.json()) as { optIn: boolean };
  const { error } = await supabase.from("profiles").update({ digest_opt_in: optIn }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
