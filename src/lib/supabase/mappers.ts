import type { Position, OpenOrder, HistoryEntry } from "@/lib/types";
import type { PlayStats } from "@/lib/store";
import type { TerminalPosition, TerminalHistoryEntry } from "@/lib/terminalStore";
import type { Automation } from "@/lib/automations";
import type { AutomationCondition, AutomationAction } from "@/lib/automationRules";
import type {
  WalletRecord,
  TerminalRecord,
  ProfileRecord,
  AcademyRecord,
  AutomationRecord,
} from "@/lib/dataStore";
import type { Database, Json } from "./database.types";

/** Row <-> client-record conversions for every /api/* route (src/lib/dataStore.ts)
 *  — one place for the snake_case-column <-> camelCase-field and
 *  timestamptz-ISO-string <-> epoch-ms mapping every route needs, instead
 *  of five routes each hand-rolling their own (and drifting). */

type PositionRow = Database["public"]["Tables"]["positions"]["Row"];
type OpenOrderRow = Database["public"]["Tables"]["open_orders"]["Row"];
type TradeHistoryRow = Database["public"]["Tables"]["trade_history"]["Row"];
type WalletRow = Database["public"]["Tables"]["wallets"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type AcademyRow = Database["public"]["Tables"]["academy_progress"]["Row"];
type AutomationRow = Database["public"]["Tables"]["automations"]["Row"];
type AutomationTriggerRow = Database["public"]["Tables"]["automation_triggers"]["Row"];

const toMs = (iso: string | null): number => (iso ? new Date(iso).getTime() : 0);
const toMsOrNull = (iso: string | null): number | null => (iso ? new Date(iso).getTime() : null);
const toIso = (ms: number): string => new Date(ms).toISOString();
const toIsoOrNull = (ms: number | null | undefined): string | null => (ms != null ? new Date(ms).toISOString() : null);

// --- Wallet (prediction-market positions/orders/history, kind='prediction') ---

export function walletToRecord(
  wallet: WalletRow | null,
  positions: PositionRow[],
  openOrders: OpenOrderRow[],
  tradeHistory: TradeHistoryRow[],
): WalletRecord {
  const stats: PlayStats = {
    tradesPlaced: wallet?.trades_placed ?? 0,
    wins: wallet?.wins ?? 0,
    losses: wallet?.losses ?? 0,
    bestPnl: wallet?.best_pnl ?? 0,
  };
  return {
    cash: wallet?.cash ?? 0,
    depositCount: wallet?.deposit_count ?? 0,
    nextDepositAt: toMs(wallet?.next_deposit_at ?? null),
    stats,
    positions: positions.map(
      (p): Position => ({
        marketId: p.market_id!,
        side: p.side as Position["side"],
        shares: p.qty,
        avgPrice: p.avg_price,
        cost: p.cost ?? 0,
        openedAt: toMs(p.opened_at),
      }),
    ),
    tradeHistory: tradeHistory.map(
      (h): HistoryEntry => ({
        id: h.id,
        label: h.label ?? "",
        strike: h.strike ?? 0,
        closePrice: h.close_price ?? undefined,
        side: h.side as HistoryEntry["side"],
        shares: h.qty,
        entryPrice: h.entry_price,
        exitPrice: h.exit_price,
        pnl: h.pnl,
        result: (h.result ?? "closed") as HistoryEntry["result"],
        closedAt: toMs(h.closed_at),
      }),
    ),
    openOrders: openOrders.map(
      (o): OpenOrder => ({
        id: o.id,
        marketId: o.market_id,
        label: o.label,
        strike: o.strike,
        side: o.side as OpenOrder["side"],
        shares: o.shares,
        limitPrice: o.limit_price,
        filledPct: o.filled_pct,
        placedAt: toMs(o.placed_at),
        status: o.status as OpenOrder["status"],
        userPlaced: true, // only userPlaced orders are ever persisted (see dataStore.ts)
      }),
    ),
  };
}

export function walletToRows(userId: string, record: WalletRecord) {
  // `updated_at` is written explicitly on every human PUT (not left to a
  // trigger) because src/lib/server/terminalExecution.ts's cron/MCP writers
  // use it as an optimistic-concurrency token on this exact row — without
  // this, a concurrent human PUT (this path) could silently overwrite a
  // server-initiated cash change without either side detecting the race.
  const wallet: Database["public"]["Tables"]["wallets"]["Insert"] = {
    user_id: userId,
    cash: record.cash,
    deposit_count: record.depositCount,
    next_deposit_at: toIsoOrNull(record.nextDepositAt || null),
    trades_placed: record.stats.tradesPlaced,
    wins: record.stats.wins,
    losses: record.stats.losses,
    best_pnl: record.stats.bestPnl,
    updated_at: new Date().toISOString(),
  };
  const positions: Database["public"]["Tables"]["positions"]["Insert"][] = record.positions.map((p) => ({
    id: `${userId}:${p.marketId}:${p.side}`,
    user_id: userId,
    kind: "prediction",
    market_id: p.marketId,
    side: p.side,
    qty: p.shares,
    avg_price: p.avgPrice,
    cost: p.cost,
    opened_at: toIso(p.openedAt),
  }));
  const openOrders: Database["public"]["Tables"]["open_orders"]["Insert"][] = record.openOrders.map((o) => ({
    id: o.id,
    user_id: userId,
    market_id: o.marketId,
    label: o.label,
    strike: o.strike,
    side: o.side,
    shares: o.shares,
    limit_price: o.limitPrice,
    filled_pct: o.filledPct,
    placed_at: toIso(o.placedAt),
    status: o.status,
  }));
  const tradeHistory: Database["public"]["Tables"]["trade_history"]["Insert"][] = record.tradeHistory.map((h) => ({
    id: h.id,
    user_id: userId,
    kind: "prediction",
    label: h.label,
    strike: h.strike,
    close_price: h.closePrice ?? null,
    side: h.side,
    qty: h.shares,
    entry_price: h.entryPrice,
    exit_price: h.exitPrice,
    pnl: h.pnl,
    result: h.result,
    closed_at: toIso(h.closedAt),
  }));
  return { wallet, positions, openOrders, tradeHistory };
}

// --- Terminal (multi-asset positions/history, kind='terminal') ---

export function terminalToRecord(positions: PositionRow[], history: TradeHistoryRow[]): TerminalRecord {
  return {
    positions: positions.map(
      (p): TerminalPosition => ({
        id: p.id,
        assetId: p.asset_id!,
        side: p.side as TerminalPosition["side"],
        qty: p.qty,
        entryPrice: p.avg_price,
        openedAt: toMs(p.opened_at),
        stopLoss: p.stop_loss ?? undefined,
        takeProfit: p.take_profit ?? undefined,
      }),
    ),
    history: history.map(
      (h): TerminalHistoryEntry => ({
        id: h.id,
        assetId: h.asset_id!,
        side: h.side as TerminalHistoryEntry["side"],
        qty: h.qty,
        entryPrice: h.entry_price,
        exitPrice: h.exit_price,
        pnl: h.pnl,
        openedAt: toMs(h.opened_at),
        closedAt: toMs(h.closed_at),
      }),
    ),
  };
}

export function terminalToRows(userId: string, record: TerminalRecord) {
  const positions: Database["public"]["Tables"]["positions"]["Insert"][] = record.positions.map((p) => ({
    id: p.id,
    user_id: userId,
    kind: "terminal",
    asset_id: p.assetId,
    side: p.side,
    qty: p.qty,
    avg_price: p.entryPrice,
    stop_loss: p.stopLoss ?? null,
    take_profit: p.takeProfit ?? null,
    opened_at: toIso(p.openedAt),
  }));
  const history: Database["public"]["Tables"]["trade_history"]["Insert"][] = record.history.map((h) => ({
    id: h.id,
    user_id: userId,
    kind: "terminal",
    asset_id: h.assetId,
    side: h.side,
    qty: h.qty,
    entry_price: h.entryPrice,
    exit_price: h.exitPrice,
    pnl: h.pnl,
    opened_at: toIso(h.openedAt),
    closed_at: toIso(h.closedAt),
  }));
  return { positions, history };
}

// --- Profile ---

export function profileToRecord(row: ProfileRow | null, email: string | null): ProfileRecord {
  return {
    handle: row?.handle ?? null,
    email: row?.email ?? email,
    avatarSeed: row?.avatar_seed ?? "trader",
    streak: row?.streak ?? 0,
    bestStreak: row?.best_streak ?? 0,
    lastClaimDay: row?.last_claim_day ?? null,
    claims: row?.claims ?? 0,
    createdAt: row?.created_at ? toMs(row.created_at) : Date.now(),
  };
}

export function profileToRow(userId: string, record: ProfileRecord) {
  const row: Database["public"]["Tables"]["profiles"]["Insert"] = {
    user_id: userId,
    handle: record.handle,
    email: record.email,
    avatar_seed: record.avatarSeed,
    streak: record.streak,
    best_streak: record.bestStreak,
    last_claim_day: record.lastClaimDay,
    claims: record.claims,
  };
  return row;
}

// --- Academy ---

export function academyToRecord(row: AcademyRow | null): AcademyRecord {
  return {
    xp: row?.xp ?? 0,
    hearts: row?.hearts ?? 5,
    lastHeartLostAt: toMs(row?.last_heart_lost_at ?? null),
    streak: row?.streak ?? 0,
    lastLessonDay: row?.last_lesson_day ?? null,
    completedLessons: row?.completed_lessons ?? [],
  };
}

export function academyToRow(userId: string, record: AcademyRecord) {
  const row: Database["public"]["Tables"]["academy_progress"]["Insert"] = {
    user_id: userId,
    xp: record.xp,
    hearts: record.hearts,
    last_heart_lost_at: toIsoOrNull(record.lastHeartLostAt || null),
    streak: record.streak,
    last_lesson_day: record.lastLessonDay,
    completed_lessons: record.completedLessons,
  };
  return row;
}

// --- Automations ---

// Fallback for any pre-Phase-C row that predates `condition`/`action`
// (nullable in the schema specifically to avoid failing the migration
// against such rows — see supabase/migrations/20260824120000_phase_c_and_f.sql).
// Renders as an always-false price-cross so a legacy row shows up inert
// rather than crashing the automations page.
const FALLBACK_CONDITION: AutomationCondition = { type: "price-cross", direction: "above", price: 0 };
const FALLBACK_ACTION: AutomationAction = { side: "long", sizeType: "fixed", sizeValue: 0 };

export function automationToRecord(row: AutomationRow, trigger: AutomationTriggerRow | null): AutomationRecord {
  const automation: Automation = {
    id: row.id,
    name: row.name,
    templateKey: row.template_key,
    category: row.category,
    symbol: row.symbol ?? "",
    condition: (row.condition as AutomationCondition | null) ?? FALLBACK_CONDITION,
    action: (row.action as AutomationAction | null) ?? FALLBACK_ACTION,
    maxOrderSize: row.max_order_size,
    dailyCap: row.daily_cap,
    rule: row.rule,
    enabled: row.enabled,
    createdAt: toMs(row.created_at),
  };
  return {
    ...automation,
    lastTriggeredAt: toMsOrNull(trigger?.last_triggered_at ?? null) ?? undefined,
    spentToday: trigger?.spent_today ?? undefined,
    spentTodayResetAt: toMsOrNull(trigger?.spent_today_reset_at ?? null) ?? undefined,
    executionsCount: trigger?.executions_count ?? undefined,
  };
}

export function automationToRow(userId: string, record: Omit<AutomationRecord, "id" | "createdAt" | "enabled">, id: string) {
  const row: Database["public"]["Tables"]["automations"]["Insert"] = {
    id,
    user_id: userId,
    name: record.name,
    template_key: record.templateKey,
    category: record.category,
    symbol: record.symbol,
    condition_type: record.condition.type,
    condition: record.condition as unknown as Json,
    action: record.action as unknown as Json,
    rule: record.rule,
    max_order_size: record.maxOrderSize,
    daily_cap: record.dailyCap,
  };
  return row;
}
