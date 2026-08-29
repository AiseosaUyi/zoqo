import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { computeOpenPosition, computeClosePosition } from "../orderExecution";
import type { TerminalPosition } from "../terminalStore";

/** Server-side order execution — the Postgres-backed counterpart to
 *  terminalStore.tsx's React-side openPosition/closePosition, sharing the
 *  exact same math (src/lib/orderExecution.ts) so a human's Buy click, the
 *  cron trigger evaluator (src/app/api/cron/evaluate-triggers/route.ts),
 *  and the Zoqo MCP server's place_order/close_position tools can never
 *  drift. Takes an injected client + explicit userId so it works with
 *  either the cookie-scoped client (a future user-facing server action) or
 *  createServiceRoleClient() (cron, MCP — see src/lib/supabase/server.ts).
 *
 *  Concurrency: today's /api/wallet and /api/terminal PUT routes do a full
 *  delete+reinsert with no race protection — tolerable for the pre-existing
 *  single-human-two-tabs case, but not once a cron job or MCP key writes
 *  concurrently with a live trading session. `wallets.updated_at` (bumped on
 *  every human PUT — see mappers.ts's walletToRows) is used here as an
 *  optimistic-concurrency token: read (cash, updated_at), compute, then
 *  UPDATE ... WHERE updated_at = <read value>; 0 rows affected means a
 *  concurrent writer won the race — retry (bounded) then fail closed rather
 *  than silently clobbering or racing a human's trade. */

const MAX_RETRIES = 3;

async function readWallet(supabase: SupabaseClient<Database>, userId: string) {
  const { data } = await supabase.from("wallets").select("cash, updated_at").eq("user_id", userId).maybeSingle();
  return data;
}

async function writeCashOptimistic(
  supabase: SupabaseClient<Database>,
  userId: string,
  applyDelta: (cash: number) => number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const wallet = await readWallet(supabase, userId);
    if (!wallet) return { ok: false, reason: "no wallet row for user" };
    const newCash = applyDelta(wallet.cash);
    if (newCash < 0) return { ok: false, reason: "insufficient cash" };
    const { data, error } = await supabase
      .from("wallets")
      .update({ cash: newCash, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("updated_at", wallet.updated_at)
      .select("user_id");
    if (error) return { ok: false, reason: error.message };
    if (data && data.length > 0) return { ok: true };
    // 0 rows affected — a concurrent writer changed updated_at since our
    // read (lost the race). Re-read the now-current cash and retry.
  }
  return { ok: false, reason: "concurrent wallet write conflict, exhausted retries" };
}

export async function openTerminalPosition(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    assetId: string;
    side: "long" | "short";
    qty: number;
    price: number;
    opts?: { stopLoss?: number; takeProfit?: number };
  },
): Promise<{ ok: true; position: TerminalPosition } | { ok: false; reason: string }> {
  const wallet = await readWallet(supabase, userId);
  if (!wallet) return { ok: false, reason: "no wallet row for user" };

  const id = crypto.randomUUID();
  const now = Date.now();
  const result = computeOpenPosition({ cash: wallet.cash, ...input, id, now });
  if (!result.ok) return result;

  const written = await writeCashOptimistic(supabase, userId, (cash) => cash + result.cashDelta);
  if (!written.ok) return written;

  const { error: insertError } = await supabase.from("positions").insert({
    id,
    user_id: userId,
    kind: "terminal",
    asset_id: input.assetId,
    side: input.side,
    qty: input.qty,
    avg_price: input.price,
    stop_loss: input.opts?.stopLoss ?? null,
    take_profit: input.opts?.takeProfit ?? null,
    opened_at: new Date(now).toISOString(),
  });
  if (insertError) {
    // Best-effort rollback of the cash debit — the wallet write already
    // succeeded, so this failure is logged by the caller, not thrown.
    await writeCashOptimistic(supabase, userId, (cash) => cash - result.cashDelta);
    return { ok: false, reason: insertError.message };
  }
  return { ok: true, position: result.position };
}

export async function closeTerminalPosition(
  supabase: SupabaseClient<Database>,
  userId: string,
  positionId: string,
  price: number,
  qty?: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: row } = await supabase
    .from("positions")
    .select("*")
    .eq("id", positionId)
    .eq("user_id", userId)
    .eq("kind", "terminal")
    .maybeSingle();
  if (!row || !row.asset_id) return { ok: false, reason: "position not found" };

  const position: TerminalPosition = {
    id: row.id,
    assetId: row.asset_id,
    side: row.side as "long" | "short",
    qty: row.qty,
    entryPrice: row.avg_price,
    openedAt: new Date(row.opened_at).getTime(),
    stopLoss: row.stop_loss ?? undefined,
    takeProfit: row.take_profit ?? undefined,
  };

  const historyId = crypto.randomUUID();
  const now = Date.now();
  const { cashDelta, historyEntry, remainingPosition } = computeClosePosition({
    position,
    price,
    qty,
    id: historyId,
    now,
  });

  const written = await writeCashOptimistic(supabase, userId, (cash) => cash + cashDelta);
  if (!written.ok) return written;

  await supabase.from("trade_history").insert({
    id: historyEntry.id,
    user_id: userId,
    kind: "terminal",
    asset_id: historyEntry.assetId,
    side: historyEntry.side,
    qty: historyEntry.qty,
    entry_price: historyEntry.entryPrice,
    exit_price: historyEntry.exitPrice,
    pnl: historyEntry.pnl,
    opened_at: new Date(historyEntry.openedAt).toISOString(),
    closed_at: new Date(historyEntry.closedAt).toISOString(),
  });

  if (remainingPosition === null) {
    await supabase.from("positions").delete().eq("id", positionId).eq("user_id", userId);
  } else {
    await supabase.from("positions").update({ qty: remainingPosition.qty }).eq("id", positionId).eq("user_id", userId);
  }
  return { ok: true };
}
