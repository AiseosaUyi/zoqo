import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCryptoPrice, getQuotePrice } from "@/lib/serverPriceFeed";
import { openTerminalPosition, closeTerminalPosition } from "@/lib/server/terminalExecution";
import { ASSET_BY_ID } from "@/lib/assets";
import { describeAutomation, type AutomationCondition, type AutomationAction } from "@/lib/automationRules";
import type { TerminalPosition } from "@/lib/terminalStore";
import type { Json } from "@/lib/supabase/database.types";

/** Zoqo MCP server tools (TERMINAL_SPEC.md §7) — every write tool goes
 *  through src/lib/server/terminalExecution.ts, the exact same order math a
 *  human's Buy click and the cron trigger evaluator use. No parallel "agent
 *  order" path, no client-supplied cap trusted over what the automation/key
 *  itself is scoped to — "an agent's own restraint isn't a security
 *  boundary" (spec's own framing). Registered onto the McpServer in
 *  src/app/api/mcp/route.ts, which also owns per-tool read/trade scope
 *  enforcement (mcp-handler's withMcpAuth gates authentication, not
 *  per-tool scope — see that file). */

export async function livePrice(assetId: string): Promise<number | null> {
  const asset = ASSET_BY_ID[assetId];
  if (!asset) return null;
  const result = asset.assetClass === "crypto" ? await getCryptoPrice(assetId) : await getQuotePrice(assetId);
  return result?.price ?? null;
}

export const ConditionSchema = z.union([
  z.object({ type: z.literal("price-cross"), direction: z.enum(["above", "below"]), price: z.number() }),
  z.object({ type: z.literal("pct-change"), direction: z.enum(["up", "down"]), pct: z.number(), windowMin: z.number() }),
  z.object({ type: z.literal("ma-cross"), fastMin: z.number(), slowMin: z.number() }),
]);

export const ActionSchema = z.object({
  side: z.enum(["long", "short"]),
  sizeType: z.enum(["fixed", "pct-buying-power"]),
  sizeValue: z.number(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
});

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorText(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

export async function getAccountSummary(userId: string) {
  const supabase = createServiceRoleClient();
  const [{ data: wallet }, { data: positions }] = await Promise.all([
    supabase.from("wallets").select("cash").eq("user_id", userId).maybeSingle(),
    supabase.from("positions").select("*").eq("user_id", userId).eq("kind", "terminal"),
  ]);
  const cash = wallet?.cash ?? 0;
  let unrealizedPnl = 0;
  for (const p of positions ?? []) {
    if (!p.asset_id) continue;
    const price = await livePrice(p.asset_id);
    if (price == null) continue;
    unrealizedPnl += p.side === "long" ? (price - p.avg_price) * p.qty : (p.avg_price - price) * p.qty;
  }
  return { cash, equity: cash + unrealizedPnl, unrealizedPnl, openPositions: positions?.length ?? 0 };
}

export async function getQuote(symbol: string) {
  const price = await livePrice(symbol);
  if (price == null) return null;
  return { symbol, price, ts: Date.now() };
}

export async function getPositions(userId: string): Promise<TerminalPosition[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("positions").select("*").eq("user_id", userId).eq("kind", "terminal");
  return (data ?? [])
    .filter((p) => p.asset_id)
    .map((p) => ({
      id: p.id,
      assetId: p.asset_id!,
      side: p.side as "long" | "short",
      qty: p.qty,
      entryPrice: p.avg_price,
      openedAt: new Date(p.opened_at).getTime(),
      stopLoss: p.stop_loss ?? undefined,
      takeProfit: p.take_profit ?? undefined,
    }));
}

/** The Terminal is market-orders-only (no resting-order concept — see
 *  CLAUDE.md) — this always returns an empty list. Kept as a real tool
 *  (not omitted) so a caller expecting the full spec §7 tool surface gets an
 *  honest empty result instead of an unknown-tool error. */
export async function getOpenOrders() {
  return [];
}

export async function getTradeHistory(userId: string, limit = 50) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("trade_history")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", "terminal")
    .order("closed_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function placeOrder(
  userId: string,
  input: { symbol: string; side: "long" | "short"; size: number; type: string; stopLoss?: number; takeProfit?: number },
) {
  if (input.type !== "market") {
    return errorText(`Unsupported order type "${input.type}" — the Terminal only supports market orders.`);
  }
  const price = await livePrice(input.symbol);
  if (price == null) return errorText(`No live price available for ${input.symbol}.`);
  const qty = input.size / price;
  const supabase = createServiceRoleClient();
  const result = await openTerminalPosition(supabase, userId, {
    assetId: input.symbol,
    side: input.side,
    qty,
    price,
    opts: { stopLoss: input.stopLoss, takeProfit: input.takeProfit },
  });
  if (!result.ok) return errorText(`Order rejected: ${result.reason}`);
  return text(result.position);
}

export async function closePosition(userId: string, id: string) {
  const supabase = createServiceRoleClient();
  const price = await priceForPosition(supabase, userId, id);
  if (price == null) return errorText("Position not found or no live price available.");
  const result = await closeTerminalPosition(supabase, userId, id, price);
  if (!result.ok) return errorText(`Close rejected: ${result.reason}`);
  return text({ ok: true });
}

async function priceForPosition(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  id: string,
): Promise<number | null> {
  const { data } = await supabase.from("positions").select("asset_id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data?.asset_id) return null;
  return livePrice(data.asset_id);
}

export async function modifyOrder(userId: string, id: string, patch: { stopLoss?: number; takeProfit?: number }) {
  const supabase = createServiceRoleClient();
  const update: { stop_loss?: number | null; take_profit?: number | null } = {};
  if ("stopLoss" in patch) update.stop_loss = patch.stopLoss ?? null;
  if ("takeProfit" in patch) update.take_profit = patch.takeProfit ?? null;
  const { error } = await supabase.from("positions").update(update).eq("id", id).eq("user_id", userId).eq("kind", "terminal");
  if (error) return errorText(error.message);
  return text({ ok: true });
}

export async function createAutomationTrigger(
  userId: string,
  input: { symbol: string; condition: AutomationCondition; action: AutomationAction; maxSize: number; dailyCap: number },
) {
  const supabase = createServiceRoleClient();
  const id = crypto.randomUUID();
  const rule = describeAutomation(input.symbol, input.condition, input.action);
  const { error } = await supabase.from("automations").insert({
    id,
    user_id: userId,
    name: `MCP: ${rule}`,
    template_key: "mcp",
    category: "MCP",
    symbol: input.symbol,
    condition_type: input.condition.type,
    condition: input.condition as unknown as Json,
    action: input.action as unknown as Json,
    rule,
    max_order_size: input.maxSize,
    daily_cap: input.dailyCap,
  });
  if (error) return errorText(error.message);
  return text({ id, rule });
}

export async function listAutomationTriggers(userId: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("automations")
    .select("*, automation_triggers(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function pauseAutomationTrigger(userId: string, id: string) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("automations").update({ enabled: false }).eq("id", id).eq("user_id", userId);
  if (error) return errorText(error.message);
  return text({ ok: true });
}

export async function getAcademyProgress(userId: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("academy_progress").select("*").eq("user_id", userId).maybeSingle();
  return data ?? { xp: 0, hearts: 5, streak: 0, completed_lessons: [] };
}
