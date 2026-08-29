import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { terminalToRecord, terminalToRows } from "@/lib/supabase/mappers";
import type { TerminalRecord } from "@/lib/dataStore";

export const dynamic = "force-dynamic";

/** Backs DataStore.getTerminal/putTerminal (src/lib/dataStore.ts) — the
 *  multi-asset terminal (terminalStore.tsx). Shares the positions/
 *  trade_history tables with the wallet route, scoped by kind='terminal'. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: positions }, { data: history }] = await Promise.all([
    supabase.from("positions").select("*").eq("user_id", user.id).eq("kind", "terminal"),
    supabase.from("trade_history").select("*").eq("user_id", user.id).eq("kind", "terminal").order("closed_at", { ascending: false }).limit(200),
  ]);

  return NextResponse.json(terminalToRecord(positions ?? [], history ?? []));
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const record = (await req.json()) as TerminalRecord;
  const { positions, history } = terminalToRows(user.id, record);

  const [delPos, delHist] = await Promise.all([
    supabase.from("positions").delete().eq("user_id", user.id).eq("kind", "terminal"),
    supabase.from("trade_history").delete().eq("user_id", user.id).eq("kind", "terminal"),
  ]);
  if (delPos.error) return NextResponse.json({ error: delPos.error.message }, { status: 500 });
  if (delHist.error) return NextResponse.json({ error: delHist.error.message }, { status: 500 });

  await Promise.all([
    positions.length ? supabase.from("positions").insert(positions) : null,
    history.length ? supabase.from("trade_history").insert(history) : null,
  ]);

  return NextResponse.json({ ok: true });
}
