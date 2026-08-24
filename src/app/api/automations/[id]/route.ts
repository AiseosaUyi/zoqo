import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AutomationRecord } from "@/lib/dataStore";
import type { Database } from "@/lib/supabase/database.types";

type AutomationUpdate = Database["public"]["Tables"]["automations"]["Update"];

export const dynamic = "force-dynamic";

const AUTOMATION_COLUMNS: Record<string, string> = {
  name: "name",
  templateKey: "template_key",
  category: "category",
  rule: "rule",
  cooldownLabel: "cooldown_label",
  executionsLabel: "executions_label",
  enabled: "enabled",
  maxOrderSize: "max_order_size",
  dailyCap: "daily_cap",
};

/** Backs DataStore.updateAutomation/removeAutomation (src/lib/dataStore.ts).
 *  Row Level Security (supabase/schema.sql) already scopes both to rows the
 *  caller owns; the `.eq("user_id", user.id)` below is the same defense in
 *  depth every other route in this app applies on top of RLS. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const patch = (await req.json()) as Partial<AutomationRecord>;
  const update: AutomationUpdate = {};
  for (const [key, column] of Object.entries(AUTOMATION_COLUMNS)) {
    if (key in patch) (update as Record<string, unknown>)[column] = (patch as Record<string, unknown>)[key];
  }

  const { error } = await supabase.from("automations").update(update).eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("automations").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
