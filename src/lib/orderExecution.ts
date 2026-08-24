import type { TerminalPosition, TerminalHistoryEntry } from "./terminalStore";

/** Pure order-execution math for the multi-asset Terminal — no React, no
 *  I/O. Extracted from terminalStore.tsx's `openPosition`/`closePosition` so
 *  a human's Buy click, the Phase C cron trigger evaluator
 *  (src/app/api/cron/evaluate-triggers/route.ts), and the Zoqo MCP server's
 *  `place_order`/`close_position` tools all execute *exactly* the same
 *  logic — no parallel "automation order" path. terminalStore.tsx and
 *  src/lib/server/terminalExecution.ts both wrap these with their own
 *  state/persistence; this file owns only the math and the caps. */

/** Position-sizing caps. 10% single-position ceiling matches two
 *  independent sources rather than an invented number: the agiprolabs
 *  trading-skills `position-sizing` skill's "Account-Level Limits" (max
 *  single position ~10% of portfolio) and polymarket-paper-trader's
 *  risk-rules.md (`max_position_pct: 0.10`). The 5% risk-at-stop cap is
 *  that skill's fixed-fractional method. */
export const MAX_POSITION_PCT = 0.1; // no single position's notional > 10% of cash
export const MAX_RISK_PCT = 0.05; // if a stop-loss is set, risk at that stop <= 5% of cash

export interface OpenPositionInput {
  cash: number;
  assetId: string;
  side: "long" | "short";
  qty: number;
  price: number;
  opts?: { stopLoss?: number; takeProfit?: number };
  /** Position id — callers supply this (crypto.randomUUID() server-side,
   *  same server-side on the client) rather than this module generating one,
   *  since a server-side ID must survive round-tripping to Postgres as the
   *  primary key `positions.id`. */
  id: string;
  now: number;
}

export type OpenPositionResult =
  | { ok: true; cashDelta: number; position: TerminalPosition }
  | { ok: false; reason: string };

export function computeOpenPosition(input: OpenPositionInput): OpenPositionResult {
  const { cash, assetId, side, qty, price, opts, id, now } = input;
  if (qty <= 0 || price <= 0) return { ok: false, reason: "invalid qty/price" };
  const cost = qty * price;
  if (cost > cash) return { ok: false, reason: "insufficient cash" };
  if (cost > cash * MAX_POSITION_PCT) return { ok: false, reason: "exceeds MAX_POSITION_PCT" };
  if (opts?.stopLoss != null) {
    const riskAmount = Math.abs(price - opts.stopLoss) * qty;
    if (riskAmount > cash * MAX_RISK_PCT) return { ok: false, reason: "exceeds MAX_RISK_PCT" };
  }
  return {
    ok: true,
    cashDelta: -cost,
    position: {
      id,
      assetId,
      side,
      qty,
      entryPrice: price,
      openedAt: now,
      stopLoss: opts?.stopLoss,
      takeProfit: opts?.takeProfit,
    },
  };
}

export interface ClosePositionInput {
  position: TerminalPosition;
  price: number;
  qty?: number;
  id: string;
  now: number;
}

export interface ClosePositionResult {
  cashDelta: number;
  historyEntry: TerminalHistoryEntry;
  /** The position row after this close — null if fully closed (caller
   *  should delete the row), otherwise the reduced-qty remainder to persist. */
  remainingPosition: TerminalPosition | null;
}

export function computeClosePosition(input: ClosePositionInput): ClosePositionResult {
  const { position, price, qty, id, now } = input;
  const closeQty = Math.min(position.qty, qty ?? position.qty);
  const pnl =
    position.side === "long" ? (price - position.entryPrice) * closeQty : (position.entryPrice - price) * closeQty;
  const remaining = position.qty - closeQty;
  return {
    // Returns the original margin for the closed portion plus/minus P&L.
    cashDelta: position.entryPrice * closeQty + pnl,
    historyEntry: {
      id,
      assetId: position.assetId,
      side: position.side,
      qty: closeQty,
      entryPrice: position.entryPrice,
      exitPrice: price,
      pnl,
      openedAt: position.openedAt,
      closedAt: now,
    },
    remainingPosition: remaining <= 0 ? null : { ...position, qty: remaining },
  };
}
