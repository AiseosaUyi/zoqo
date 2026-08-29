import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCryptoPrice, getQuotePrice } from "@/lib/serverPriceFeed";
import { openTerminalPosition } from "@/lib/server/terminalExecution";
import { ASSET_BY_ID } from "@/lib/assets";
import type { AutomationCondition, AutomationAction } from "@/lib/automationRules";

export const dynamic = "force-dynamic";

/** Phase C's trigger evaluator (spec §8) — Vercel Cron hits this once a
 *  minute (see vercel.ts). Not user-callable: authenticated by a shared
 *  secret (CRON_SECRET), not a user session, since there is no single "user"
 *  for a job that evaluates every enabled trigger across every account.
 *  Executes through src/lib/server/terminalExecution.ts — the same
 *  order-placement math terminalStore.tsx's openPosition uses — and enforces
 *  every trigger's maxOrderSize/dailyCap server-side, never trusting the
 *  caller. See PHASE_C_HANDOFF.md's C2 for the full design rationale. */

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

// Forex/gold prices are cached at most this fresh — TwelveData's free tier
// is 800 req/day; 4 assets at a 10 min cache = 576/day, comfortably under
// budget. Crypto (Bitstamp/CoinGecko) has no such ceiling and refreshes
// every tick.
const FOREX_GOLD_STALE_MS = 10 * 60 * 1000;
const PRICE_HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;
const DAILY_CAP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Fetches (or reuses a fresh cached) price for one asset and appends it to
 *  price_history — the self-built series pct-change/ma-cross conditions
 *  evaluate against, since no per-asset historical-candle source exists
 *  outside BTC today. */
async function fetchAndRecordPrice(supabase: SupabaseServiceClient, assetId: string): Promise<number | null> {
  const asset = ASSET_BY_ID[assetId];
  if (!asset) return null;

  if (asset.assetClass === "crypto") {
    const result = await getCryptoPrice(assetId);
    if (!result) return null;
    await supabase.from("price_history").insert({ asset_id: assetId, price: result.price });
    return result.price;
  }

  const { data: last } = await supabase
    .from("price_history")
    .select("price, ts")
    .eq("asset_id", assetId)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && Date.now() - new Date(last.ts).getTime() < FOREX_GOLD_STALE_MS) return last.price;

  const result = await getQuotePrice(assetId);
  if (!result) return last?.price ?? null;
  await supabase.from("price_history").insert({ asset_id: assetId, price: result.price });
  return result.price;
}

interface PricePoint {
  price: number;
  ts: number;
}

async function readSeries(supabase: SupabaseServiceClient, assetId: string): Promise<PricePoint[]> {
  const { data } = await supabase
    .from("price_history")
    .select("price, ts")
    .eq("asset_id", assetId)
    .order("ts", { ascending: true })
    .limit(1000);
  return (data ?? []).map((r) => ({ price: r.price, ts: new Date(r.ts).getTime() }));
}

function average(points: PricePoint[]): number {
  return points.reduce((sum, p) => sum + p.price, 0) / points.length;
}

/** Evaluates one automation's condition against the self-built price series
 *  for its asset (already includes this tick's just-fetched price as the
 *  last point). Returns whether the condition fired *this tick* — every
 *  condition type detects an actual crossing/threshold event between the
 *  previous and current sample, not "is currently past X," so a trigger
 *  fires once per crossing rather than every tick it stays past threshold. */
function evaluateCondition(condition: AutomationCondition, series: PricePoint[]): { fired: boolean; reason?: string } {
  if (series.length < 2) return { fired: false, reason: "not enough price history yet" };
  const curr = series[series.length - 1].price;
  const prev = series[series.length - 2].price;

  if (condition.type === "price-cross") {
    const fired =
      condition.direction === "above"
        ? prev < condition.price && curr >= condition.price
        : prev > condition.price && curr <= condition.price;
    return { fired };
  }

  if (condition.type === "pct-change") {
    const cutoff = series[series.length - 1].ts - condition.windowMin * 60_000;
    const old = [...series].reverse().find((p) => p.ts <= cutoff);
    if (!old) return { fired: false, reason: "window not filled yet" };
    const pctMove = ((curr - old.price) / old.price) * 100;
    const fired = condition.direction === "up" ? pctMove >= condition.pct : -pctMove >= condition.pct;
    return { fired };
  }

  // ma-cross
  const need = condition.slowMin;
  if (series.length < need + 1) return { fired: false, reason: "slow MA window not filled yet" };
  const nowWindow = series.slice(-need);
  const prevWindow = series.slice(-need - 1, -1);
  const fastNow = average(nowWindow.slice(-condition.fastMin));
  const slowNow = average(nowWindow);
  const fastPrev = average(prevWindow.slice(-condition.fastMin));
  const slowPrev = average(prevWindow);
  const fired = Math.sign(fastPrev - slowPrev) !== Math.sign(fastNow - slowNow) && fastNow !== slowNow;
  return { fired };
}

function orderNotional(action: AutomationAction, cash: number): number {
  return action.sizeType === "fixed" ? action.sizeValue : cash * (action.sizeValue / 100);
}

interface AutomationRow {
  id: string;
  user_id: string;
  enabled: boolean;
  symbol: string | null;
  condition: unknown;
  action: unknown;
  max_order_size: number;
  daily_cap: number;
}

interface TriggerState {
  spent_today: number;
  spent_today_reset_at: string;
  executions_count: number;
}

async function readTriggerState(supabase: SupabaseServiceClient, automationId: string): Promise<TriggerState> {
  const { data } = await supabase
    .from("automation_triggers")
    .select("spent_today, spent_today_reset_at, executions_count")
    .eq("automation_id", automationId)
    .maybeSingle();
  if (data) return data;
  const fresh = { spent_today: 0, spent_today_reset_at: new Date().toISOString(), executions_count: 0 };
  await supabase.from("automation_triggers").insert({ automation_id: automationId, ...fresh });
  return fresh;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const results: Array<{ automationId: string; outcome: string }> = [];

  const { data: automations } = await supabase
    .from("automations")
    .select("id, user_id, enabled, symbol, condition, action, max_order_size, daily_cap")
    .eq("enabled", true);

  const rows = (automations ?? []) as AutomationRow[];
  const symbols = [...new Set(rows.map((a) => a.symbol).filter((s): s is string => Boolean(s)))];

  const seriesBySymbol = new Map<string, PricePoint[]>();
  for (const symbol of symbols) {
    const price = await fetchAndRecordPrice(supabase, symbol);
    if (price == null) continue;
    seriesBySymbol.set(symbol, await readSeries(supabase, symbol));
  }

  for (const automation of rows) {
    if (!automation.symbol || !automation.condition || !automation.action) {
      results.push({ automationId: automation.id, outcome: "skipped: missing symbol/condition/action" });
      continue;
    }
    const series = seriesBySymbol.get(automation.symbol);
    if (!series) {
      results.push({ automationId: automation.id, outcome: "skipped: no price available" });
      continue;
    }

    const condition = automation.condition as AutomationCondition;
    const action = automation.action as AutomationAction;
    const evalResult = evaluateCondition(condition, series);
    await supabase
      .from("automation_triggers")
      .upsert({ automation_id: automation.id, last_evaluated_at: new Date().toISOString() }, { onConflict: "automation_id" });
    if (!evalResult.fired) {
      results.push({ automationId: automation.id, outcome: evalResult.reason ?? "not fired" });
      continue;
    }

    const state = await readTriggerState(supabase, automation.id);
    const windowExpired = Date.now() - new Date(state.spent_today_reset_at).getTime() > DAILY_CAP_WINDOW_MS;
    const spentToday = windowExpired ? 0 : state.spent_today;
    const resetAt = windowExpired ? new Date().toISOString() : state.spent_today_reset_at;

    const price = series[series.length - 1].price;
    let orderDollars = action.sizeValue;
    if (action.sizeType === "pct-buying-power") {
      const { data: wallet } = await supabase.from("wallets").select("cash").eq("user_id", automation.user_id).maybeSingle();
      orderDollars = wallet ? orderNotional(action, wallet.cash) : 0;
    }

    if (orderDollars <= 0) {
      results.push({ automationId: automation.id, outcome: "skipped: zero order size" });
      continue;
    }
    if (orderDollars > automation.max_order_size) {
      results.push({ automationId: automation.id, outcome: "rejected: exceeds maxOrderSize" });
      continue;
    }
    if (spentToday + orderDollars > automation.daily_cap) {
      results.push({ automationId: automation.id, outcome: "rejected: exceeds dailyCap" });
      continue;
    }

    const qty = orderDollars / price;
    const opened = await openTerminalPosition(supabase, automation.user_id, {
      assetId: automation.symbol,
      side: action.side,
      qty,
      price,
      opts: { stopLoss: action.stopLoss, takeProfit: action.takeProfit },
    });

    if (!opened.ok) {
      results.push({ automationId: automation.id, outcome: `execution failed: ${opened.reason}` });
      continue;
    }

    await supabase
      .from("automation_triggers")
      .update({
        last_triggered_at: new Date().toISOString(),
        spent_today: spentToday + orderDollars,
        spent_today_reset_at: resetAt,
        executions_count: state.executions_count + 1,
      })
      .eq("automation_id", automation.id);

    results.push({ automationId: automation.id, outcome: "executed" });
  }

  await supabase.from("price_history").delete().lt("ts", new Date(Date.now() - PRICE_HISTORY_RETENTION_MS).toISOString());

  return NextResponse.json({ ok: true, evaluated: rows.length, results } satisfies {
    ok: true;
    evaluated: number;
    results: typeof results;
  });
}
