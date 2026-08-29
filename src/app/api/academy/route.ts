import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { academyToRecord, academyToRow } from "@/lib/supabase/mappers";
import type { AcademyRecord } from "@/lib/dataStore";

export const dynamic = "force-dynamic";

/** Backs DataStore.getAcademy/putAcademy (src/lib/dataStore.ts). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: row } = await supabase.from("academy_progress").select("*").eq("user_id", user.id).maybeSingle();
  return NextResponse.json(academyToRecord(row ?? null));
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const record = (await req.json()) as AcademyRecord;
  const { error } = await supabase.from("academy_progress").upsert(academyToRow(user.id, record));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
