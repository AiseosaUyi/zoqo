import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { walletToRows, terminalToRows, profileToRow, academyToRow, automationToRow } from "@/lib/supabase/mappers";
import type { LocalStorageSnapshot } from "@/lib/dataStore";

export const dynamic = "force-dynamic";

/** Backs DataStore.migrateFromLocalStorage — the one-shot import a client
 *  fires on first real sign-in (see the plan's migration-on-first-login
 *  step). Insert-if-not-exists per domain, keyed off the wallet row's
 *  existence, so calling this twice for the same user (a retried request)
 *  never double-credits cash — the known accepted tradeoff from the plan is
 *  that a *second device* with its own pre-existing local data loses that
 *  data silently once the first device has already migrated, not that a
 *  retry double-imports. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: existing } = await supabase.from("wallets").select("user_id").eq("user_id", user.id).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, migrated: false, reason: "already migrated" });

  const snapshot = (await req.json()) as LocalStorageSnapshot;

  if (snapshot.wallet) {
    const { wallet, positions, openOrders, tradeHistory } = walletToRows(user.id, snapshot.wallet);
    await supabase.from("wallets").insert(wallet);
    if (positions.length) await supabase.from("positions").insert(positions);
    if (openOrders.length) await supabase.from("open_orders").insert(openOrders);
    if (tradeHistory.length) await supabase.from("trade_history").insert(tradeHistory);
  }

  if (snapshot.terminal) {
    const { positions, history } = terminalToRows(user.id, snapshot.terminal);
    if (positions.length) await supabase.from("positions").insert(positions);
    if (history.length) await supabase.from("trade_history").insert(history);
  }

  if (snapshot.profile) {
    await supabase.from("profiles").upsert(profileToRow(user.id, snapshot.profile));
  }

  if (snapshot.academy) {
    await supabase.from("academy_progress").upsert(academyToRow(user.id, snapshot.academy));
  }

  for (const automation of snapshot.automations ?? []) {
    await supabase.from("automations").insert(automationToRow(user.id, automation, automation.id));
  }

  return NextResponse.json({ ok: true, migrated: true });
}
