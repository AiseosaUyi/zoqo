import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { profileToRecord, profileToRow } from "@/lib/supabase/mappers";
import type { ProfileRecord } from "@/lib/dataStore";

export const dynamic = "force-dynamic";

/** Backs DataStore.getProfile/putProfile (src/lib/dataStore.ts). Real
 *  Supabase Auth session (see src/lib/supabase/client.ts) replaces
 *  profile.tsx's mocked email+OTP flow once that provider is migrated. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: row } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  return NextResponse.json(profileToRecord(row ?? null, user.email ?? null));
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const record = (await req.json()) as ProfileRecord;
  const { error } = await supabase.from("profiles").upsert(profileToRow(user.id, record));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
