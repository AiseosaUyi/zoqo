"use client";
import * as React from "react";
import { useZoqo } from "./store";
import { ASSET_BY_ID } from "./assets";
import { useLocalStorageState } from "./useLocalStorageState";
import { BACKEND_ENABLED, getDataStore } from "./getDataStore";
import { useProfile } from "./profile";
import { computeOpenPosition, computeClosePosition, MAX_POSITION_PCT, MAX_RISK_PCT } from "./orderExecution";

export { MAX_POSITION_PCT, MAX_RISK_PCT };

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

/** A resting Limit order — market orders never reach this list at all (they
 *  execute immediately through `openPosition`); this only holds orders
 *  waiting for the market to reach `limitPrice`. Checked once per price tick
 *  by `checkLimitOrders`, which fills through the exact same `openPosition`
 *  path a human's market Buy/Sell click uses — no separate "limit fill"
 *  execution logic. */
export interface TerminalOrder {
  id: string;
  assetId: string;
  side: "long" | "short";
  qty: number;
  limitPrice: number;
  createdAt: number;
  reduceOnly?: boolean;
  stopLoss?: number;
  takeProfit?: number;
}

const POSITIONS_KEY = "zoqo-terminal-positions-v1";
const HISTORY_KEY = "zoqo-terminal-history-v1";
const ORDERS_KEY = "zoqo-terminal-orders-v1";

const EMPTY_POSITIONS: TerminalPosition[] = [];
const EMPTY_HISTORY: TerminalHistoryEntry[] = [];
const EMPTY_ORDERS: TerminalOrder[] = [];

function mergeArray<T>(parsed: unknown, def: T[]): T[] {
  return Array.isArray(parsed) ? (parsed as T[]) : def;
}

interface TerminalCtx {
  positions: TerminalPosition[];
  history: TerminalHistoryEntry[];
  orders: TerminalOrder[];
  /** Open a market position sized in units of the underlying (e.g. 0.01 BTC),
   *  costing qty * price against the shared wallet. Returns false if the
   *  wallet can't cover it. `reduceOnly` caps qty at the existing opposite-
   *  side position's size (positions don't net together today — see
   *  orderExecution.ts — so this is the honest amount of "reduce" this model
   *  can actually express); returns false if there's nothing to reduce. */
  openPosition: (
    assetId: string,
    side: "long" | "short",
    qty: number,
    price: number,
    opts?: { stopLoss?: number; takeProfit?: number; reduceOnly?: boolean },
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
  /** Places a resting Limit order — validated (reduce-only capping, the same
   *  MAX_POSITION_PCT sanity check `openPosition` applies) at placement time
   *  against a *hypothetical* fill at `limitPrice`, not at the live mark.
   *  Returns false if nothing valid could be placed (e.g. reduce-only with
   *  no opposite position to reduce). */
  placeLimitOrder: (
    assetId: string,
    side: "long" | "short",
    qty: number,
    limitPrice: number,
    opts?: { stopLoss?: number; takeProfit?: number; reduceOnly?: boolean },
  ) => boolean;
  cancelOrder: (id: string) => void;
  /** Checks every resting Limit order against the latest marks and fills
   *  anything crossed, at the limit price (not the possibly-better mark) —
   *  same conservative-fill convention `checkStops` already uses. Fills
   *  through `openPosition`, so a filled limit order is indistinguishable
   *  from a market order once it lands in `positions`/`history`. Returns the
   *  fills so the caller can surface a toast. */
  checkLimitOrders: (prices: Record<string, number>) => FilledLimitOrder[];
}

export interface FilledLimitOrder {
  assetId: string;
  side: "long" | "short";
  qty: number;
  price: number;
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

/** Read-only terminal trade history, usable anywhere in the app (e.g. the
 *  profile page's trade journal) without mounting the full TerminalProvider
 *  — useLocalStorageState reads straight off the same HISTORY_KEY the
 *  provider writes to, so it stays in sync whether or not /terminal has been
 *  visited this session. */
export function useTerminalHistory(): TerminalHistoryEntry[] {
  const [history] = useLocalStorageState(HISTORY_KEY, EMPTY_HISTORY, mergeArray);
  return history;
}

/** Read-only resting Limit orders — same reuse-anywhere shape as
 *  useTerminalHistory(), for the Data Tables panel's Open Orders tab. */
export function useTerminalOrders(): TerminalOrder[] {
  const [orders] = useLocalStorageState(ORDERS_KEY, EMPTY_ORDERS, mergeArray);
  return orders;
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
  const [orders, setOrders] = useLocalStorageState(ORDERS_KEY, EMPTY_ORDERS, mergeArray);
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
      opts?: { stopLoss?: number; takeProfit?: number; reduceOnly?: boolean },
    ): boolean => {
      if (!ASSET_BY_ID[assetId]) return false;
      let effectiveQty = qty;
      if (opts?.reduceOnly) {
        // Positions don't net together in this model (a new order always
        // opens a separate row — see orderExecution.ts) — "reduce" is
        // expressed as "cap at however much opposite-side exposure exists to
        // close," not true position netting.
        const oppositeQty = positions
          .filter((p) => p.assetId === assetId && p.side !== side)
          .reduce((s, p) => s + p.qty, 0);
        effectiveQty = Math.min(qty, oppositeQty);
        if (effectiveQty <= 0) return false;
      }
      const result = computeOpenPosition({
        cash,
        assetId,
        side,
        qty: effectiveQty,
        price,
        opts,
        id: crypto.randomUUID(),
        now: Date.now(),
      });
      if (!result.ok) return false;
      adjustCash(result.cashDelta);
      setPositions((prev) => [result.position, ...prev]);
      return true;
    },
    [cash, positions, adjustCash, setPositions],
  );

  const placeLimitOrder = React.useCallback(
    (
      assetId: string,
      side: "long" | "short",
      qty: number,
      limitPrice: number,
      opts?: { stopLoss?: number; takeProfit?: number; reduceOnly?: boolean },
    ): boolean => {
      if (!ASSET_BY_ID[assetId] || qty <= 0 || limitPrice <= 0) return false;
      let effectiveQty = qty;
      if (opts?.reduceOnly) {
        const oppositeQty = positions
          .filter((p) => p.assetId === assetId && p.side !== side)
          .reduce((s, p) => s + p.qty, 0);
        effectiveQty = Math.min(qty, oppositeQty);
        if (effectiveQty <= 0) return false;
      }
      // Same MAX_POSITION_PCT sanity check computeOpenPosition applies at
      // fill time, run early against a hypothetical fill at limitPrice — a
      // doomed order shouldn't sit in Open Orders looking live until it
      // finally crosses and gets silently rejected.
      if (effectiveQty * limitPrice > cash * MAX_POSITION_PCT) return false;
      setOrders((prev) => [
        {
          id: crypto.randomUUID(),
          assetId,
          side,
          qty: effectiveQty,
          limitPrice,
          createdAt: Date.now(),
          reduceOnly: opts?.reduceOnly,
          stopLoss: opts?.stopLoss,
          takeProfit: opts?.takeProfit,
        },
        ...prev,
      ]);
      return true;
    },
    [cash, positions, setOrders],
  );

  const cancelOrder = React.useCallback(
    (id: string) => {
      setOrders((prev) => prev.filter((o) => o.id !== id));
    },
    [setOrders],
  );

  const checkLimitOrders = React.useCallback(
    (prices: Record<string, number>): FilledLimitOrder[] => {
      const fills: FilledLimitOrder[] = [];
      for (const o of orders) {
        const mark = prices[o.assetId];
        if (!mark) continue;
        const crossed = o.side === "long" ? mark <= o.limitPrice : mark >= o.limitPrice;
        if (!crossed) continue;
        // A Limit order guarantees "this price or better," unlike a stop,
        // which guarantees "this price, not worse" — the opposite direction.
        // Filling at o.limitPrice here would overpay a buy (or undersell a
        // sell) whenever the mark gapped past the limit in the trader's
        // favor; `crossed` above already guarantees mark is at least as good
        // as the limit, so filling at mark is always correct.
        const filled = openPosition(o.assetId, o.side, o.qty, mark, {
          stopLoss: o.stopLoss,
          takeProfit: o.takeProfit,
        });
        if (filled) {
          setOrders((prev) => prev.filter((x) => x.id !== o.id));
          fills.push({ assetId: o.assetId, side: o.side, qty: o.qty, price: mark });
        }
      }
      return fills;
    },
    [orders, openPosition, setOrders],
  );

  const closePosition = React.useCallback(
    (id: string, price: number, qty?: number) => {
      setPositions((prev) => {
        const i = prev.findIndex((p) => p.id === id);
        if (i < 0) return prev;
        const { cashDelta, historyEntry, remainingPosition } = computeClosePosition({
          position: prev[i],
          price,
          qty,
          id: crypto.randomUUID(),
          now: Date.now(),
        });
        adjustCash(cashDelta);
        setHistory((h) => [historyEntry, ...h].slice(0, 200));
        const next = prev.slice();
        if (remainingPosition === null) next.splice(i, 1);
        else next[i] = remainingPosition;
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

  const value: TerminalCtx = {
    positions,
    history,
    orders,
    openPosition,
    closePosition,
    markToMarket,
    checkStops,
    placeLimitOrder,
    cancelOrder,
    checkLimitOrders,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
