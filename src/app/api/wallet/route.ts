import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { walletToRecord, walletToRows } from "@/lib/supabase/mappers";
import type { WalletRecord } from "@/lib/dataStore";

export const dynamic = "force-dynamic";

/** Backs DataStore.getWallet/putWallet (src/lib/dataStore.ts) — the
 *  prediction-market wallet (store.tsx). Positions/open orders/trade
 *  history are stored with kind='prediction' in the shared positions/
 *  trade_history tables (see supabase/schema.sql). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: wallet }, { data: positions }, { data: openOrders }, { data: tradeHistory }] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("positions").select("*").eq("user_id", user.id).eq("kind", "prediction"),
    supabase.from("open_orders").select("*").eq("user_id", user.id),
    supabase.from("trade_history").select("*").eq("user_id", user.id).eq("kind", "prediction").order("closed_at", { ascending: false }).limit(200),
  ]);

  return NextResponse.json(walletToRecord(wallet ?? null, positions ?? [], openOrders ?? [], tradeHistory ?? []));
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const record = (await req.json()) as WalletRecord;
  const { wallet, positions, openOrders, tradeHistory } = walletToRows(user.id, record);

  // Full-replace, mirroring store.tsx's persist-on-every-change effect —
  // not a real transaction (would need an RPC), acceptable at this scale
  // per the plan (src/lib/dataStore.ts's design comment).
  const [walletResult] = await Promise.all([
    supabase.from("wallets").upsert(wallet),
    supabase.from("positions").delete().eq("user_id", user.id).eq("kind", "prediction"),
    supabase.from("open_orders").delete().eq("user_id", user.id),
    supabase.from("trade_history").delete().eq("user_id", user.id).eq("kind", "prediction"),
  ]);
  if (walletResult.error) return NextResponse.json({ error: walletResult.error.message }, { status: 500 });

  await Promise.all([
    positions.length ? supabase.from("positions").insert(positions) : null,
    openOrders.length ? supabase.from("open_orders").insert(openOrders) : null,
    tradeHistory.length ? supabase.from("trade_history").insert(tradeHistory) : null,
  ]);

  return NextResponse.json({ ok: true });
}
