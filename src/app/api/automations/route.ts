import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { automationToRecord, automationToRow } from "@/lib/supabase/mappers";
import type { AutomationRecord } from "@/lib/dataStore";

export const dynamic = "force-dynamic";

/** Backs DataStore.listAutomations/createAutomation (src/lib/dataStore.ts).
 *  Per-id operations (update/remove) are /api/automations/[id]. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: automations } = await supabase
    .from("automations")
    .select("*, automation_triggers(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const records = (automations ?? []).map((a) =>
    automationToRecord(a, Array.isArray(a.automation_triggers) ? (a.automation_triggers[0] ?? null) : a.automation_triggers),
  );
  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const input = (await req.json()) as Omit<AutomationRecord, "id" | "createdAt" | "enabled">;
  const id = crypto.randomUUID();
  const { data: row, error } = await supabase
    .from("automations")
    .insert(automationToRow(user.id, input, id))
    .select()
    .single();
  if (error || !row) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  return NextResponse.json(automationToRecord(row, null));
}
