"use client";
import * as React from "react";
import { useZoqo } from "./store";
import { ASSET_BY_ID } from "./assets";
import { useLocalStorageState } from "./useLocalStorageState";
import { BACKEND_ENABLED, getDataStore } from "./getDataStore";
import { useProfile } from "./profile";

/** A held position in the position-based Terminal (distinct from the
 *  prediction market's `Position` in types.ts, which is a share of a
 *  binary market — this is a real open/close position with mark-to-market
 *  P&L, the mechanic every "professional" terminal actually uses). */
export interface TerminalPosition {
  id: string;
  assetId: string;
  side: "long" | "short";
  qty: number;
  entryPrice: number;
  openedAt: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface TerminalHistoryEntry {
  id: string;
  assetId: string;
  side: "long" | "short";
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  openedAt: number;
  closedAt: number;
}

const POSITIONS_KEY = "zoqo-terminal-positions-v1";
const HISTORY_KEY = "zoqo-terminal-history-v1";

/** Position-sizing caps. 10% single-position ceiling matches two
 *  independent sources rather than an invented number: the agiprolabs
 *  trading-skills `position-sizing` skill's "Account-Level Limits" (max
 *  single position ~10% of portfolio) and polymarket-paper-trader's
 *  risk-rules.md (`max_position_pct: 0.10`). The 5% risk-at-stop cap is
 *  that skill's fixed-fractional method, which the Academy's own Risk
 *  Management unit already teaches as 1-2% risk per trade via stop
 *  distance — this is the outer ceiling, not the taught target. Before
 *  this, the only cap on `openPosition` was `cost > cash` — "however much
 *  cash you have" — the exact gap CLAUDE_CODE_HANDOFF.md §3 flagged ahead
 *  of real money touching this path. Kelly-criterion sizing isn't
 *  applicable yet — Kelly needs an estimated win rate/payoff ratio from
 *  real trade history (the skill's own minimum is 50+ trades), which a
 *  fresh paper-trading account doesn't have; a flat fixed-fractional cap is
 *  the right tool until there's enough history to estimate an edge from. */
export const MAX_POSITION_PCT = 0.1; // no single position's notional > 10% of cash
export const MAX_RISK_PCT = 0.05; // if a stop-loss is set, risk at that stop <= 5% of cash
const EMPTY_POSITIONS: TerminalPosition[] = [];
const EMPTY_HISTORY: TerminalHistoryEntry[] = [];

function mergeArray<T>(parsed: unknown, def: T[]): T[] {
  return Array.isArray(parsed) ? (parsed as T[]) : def;
}

interface TerminalCtx {
  positions: TerminalPosition[];
  history: TerminalHistoryEntry[];
  /** Open a market position sized in units of the underlying (e.g. 0.01 BTC),
   *  costing qty * price against the shared wallet. Returns false if the
   *  wallet can't cover it. */
  openPosition: (
    assetId: string,
    side: "long" | "short",
    qty: number,
    price: number,
    opts?: { stopLoss?: number; takeProfit?: number },
  ) => boolean;
  /** Close (fully or partially) at the current price, crediting/debiting the
   *  shared wallet by the realized P&L. */
  closePosition: (id: string, price: number, qty?: number) => void;
  markToMarket: (prices: Record<string, number>) => { unrealizedPnl: number; equity: number };
  /** Checks every open position's stop-loss/take-profit against the latest
   *  marks and auto-closes anything breached, filling at the SL/TP level
   *  (not the possibly-gapped mark price). Returns the triggered closes so
   *  the caller can surface a toast — without this, stopLoss/takeProfit are
   *  fields that get stored on open but never actually protect anyone. */
  checkStops: (prices: Record<string, number>) => TriggeredStop[];
}

export interface TriggeredStop {
  assetId: string;
  side: "long" | "short";
  reason: "stop-loss" | "take-profit";
  exitPrice: number;
  pnl: number;
}

const Ctx = React.createContext<TerminalCtx | null>(null);

export function useTerminal() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useTerminal must be used within TerminalProvider");
  return c;
}

/**
 * Position-based paper trading for the multi-asset Terminal. Shares the same
 * cash balance as the prediction market via useZoqo().adjustCash — this is
 * one wallet, not two: exactly the "test money and real money behave
 * identically, there's just one ledger" requirement from the brief (see
 * TERMINAL_SPEC.md §1). Positions/history persist under their own
 * localStorage keys so this stays additive to the existing wallet shape.
 */
export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const { adjustCash, cash } = useZoqo();
  const [positions, setPositions] = useLocalStorageState(POSITIONS_KEY, EMPTY_POSITIONS, mergeArray);
  const [history, setHistory] = useLocalStorageState(HISTORY_KEY, EMPTY_HISTORY, mergeArray);
  // TerminalProvider is always mounted inside ProfileProvider (it's a page-
  // local provider under (app)/layout.tsx's tree, never the outermost one
  // the way ZoqoProvider is), so useProfile() is safe here.
  const { signedIn } = useProfile();

  // Overlay the remote terminal positions/history once per sign-in.
  const remoteAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (!BACKEND_ENABLED || !signedIn || remoteAppliedRef.current) return;
    remoteAppliedRef.current = true;
    getDataStore()
      .getTerminal()
      .then((remote) => {
        if (!remote) return;
        if (remote.positions.length) setPositions(remote.positions);
        if (remote.history.length) setHistory(remote.history);
      });
  }, [signedIn, setPositions, setHistory]);

  // Push local changes to Postgres once signed in — additive to the
  // localStorage writes useLocalStorageState's own setters already do.
  React.useEffect(() => {
    if (!BACKEND_ENABLED || !signedIn) return;
    void getDataStore().putTerminal({ positions, history });
  }, [signedIn, positions, history]);

  const openPosition = React.useCallback(
    (
      assetId: string,
      side: "long" | "short",
      qty: number,
      price: number,
      opts?: { stopLoss?: number; takeProfit?: number },
    ): boolean => {
      if (!ASSET_BY_ID[assetId] || qty <= 0 || price <= 0) return false;
      const cost = qty * price;
      if (cost > cash) return false;
      if (cost > cash * MAX_POSITION_PCT) return false;
      if (opts?.stopLoss != null) {
        const riskAmount = Math.abs(price - opts.stopLoss) * qty;
        if (riskAmount > cash * MAX_RISK_PCT) return false;
      }
      adjustCash(-cost);
      setPositions((prev) => [
        {
          id: `pos-${Date.now().toString(36)}-${prev.length}`,
          assetId,
          side,
          qty,
          entryPrice: price,
          openedAt: Date.now(),
          stopLoss: opts?.stopLoss,
          takeProfit: opts?.takeProfit,
        },
        ...prev,
      ]);
      return true;
    },
    [cash, adjustCash, setPositions],
  );

  const closePosition = React.useCallback(
    (id: string, price: number, qty?: number) => {
      setPositions((prev) => {
        const i = prev.findIndex((p) => p.id === id);
        if (i < 0) return prev;
        const pos = prev[i];
        const closeQty = Math.min(pos.qty, qty ?? pos.qty);
        const pnl =
          pos.side === "long"
            ? (price - pos.entryPrice) * closeQty
            : (pos.entryPrice - price) * closeQty;
        // Return the original margin for the closed portion plus/minus P&L.
        adjustCash(pos.entryPrice * closeQty + pnl);
        setHistory((h) => [
          {
            id: `th-${Date.now().toString(36)}`,
            assetId: pos.assetId,
            side: pos.side,
            qty: closeQty,
            entryPrice: pos.entryPrice,
            exitPrice: price,
            pnl,
            openedAt: pos.openedAt,
            closedAt: Date.now(),
          },
          ...h,
        ].slice(0, 200));
        const remaining = pos.qty - closeQty;
        const next = prev.slice();
        if (remaining <= 0) next.splice(i, 1);
        else next[i] = { ...pos, qty: remaining };
        return next;
      });
    },
    [adjustCash, setHistory, setPositions],
  );

  const checkStops = React.useCallback(
    (prices: Record<string, number>): TriggeredStop[] => {
      const triggered: TriggeredStop[] = [];
      for (const p of positions) {
        const mark = prices[p.assetId];
        if (!mark) continue;
        let hit: { price: number; reason: "stop-loss" | "take-profit" } | null = null;
        if (p.side === "long") {
          if (p.stopLoss != null && mark <= p.stopLoss) hit = { price: p.stopLoss, reason: "stop-loss" };
          else if (p.takeProfit != null && mark >= p.takeProfit) hit = { price: p.takeProfit, reason: "take-profit" };
        } else {
          if (p.stopLoss != null && mark >= p.stopLoss) hit = { price: p.stopLoss, reason: "stop-loss" };
          else if (p.takeProfit != null && mark <= p.takeProfit) hit = { price: p.takeProfit, reason: "take-profit" };
        }
        if (!hit) continue;
        const pnl =
          p.side === "long" ? (hit.price - p.entryPrice) * p.qty : (p.entryPrice - hit.price) * p.qty;
        closePosition(p.id, hit.price);
        triggered.push({ assetId: p.assetId, side: p.side, reason: hit.reason, exitPrice: hit.price, pnl });
      }
      return triggered;
    },
    [positions, closePosition],
  );

  const markToMarket = React.useCallback(
    (prices: Record<string, number>) => {
      let unrealizedPnl = 0;
      for (const p of positions) {
        const px = prices[p.assetId];
        if (!px) continue;
        unrealizedPnl += p.side === "long" ? (px - p.entryPrice) * p.qty : (p.entryPrice - px) * p.qty;
      }
      return { unrealizedPnl, equity: cash + unrealizedPnl };
    },
    [positions, cash],
  );

  const value: TerminalCtx = { positions, history, openPosition, closePosition, markToMarket, checkStops };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
