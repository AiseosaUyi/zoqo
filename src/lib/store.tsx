"use client";
import * as React from "react";
import { MarketEngine } from "./engine";
import { fetchHistory, useLiveBtc } from "./useBtc";
import { useLocalStorageState } from "./useLocalStorageState";
import type {
  Candle, EngineSnapshot, HistoryEntry, Market, OpenOrder, Position, Side,
} from "./types";

const TICK_MS = 600;
const DEPOSIT_AMOUNT = 50;
const WALLET_KEY = "zoqo-wallet-v2";

export function depositCooldownMs(depositsDone: number): number {
  if (depositsDone <= 0) return 0;
  if (depositsDone === 1) return 1 * 3600_000;
  if (depositsDone === 2) return 2 * 3600_000;
  if (depositsDone === 3) return 3 * 3600_000;
  return 24 * 3600_000;
}

export interface PlayStats {
  tradesPlaced: number;
  wins: number;
  losses: number;
  bestPnl: number;
}
const ZERO_STATS: PlayStats = { tradesPlaced: 0, wins: 0, losses: 0, bestPnl: 0 };

/** Fired when a position settles — used for the toast and bot telemetry. */
export interface SettlementResult {
  id: string;
  marketLabel: string;
  strike: number;
  closePrice: number; // actual BTC price at close
  side: Side;
  won: boolean;
  pnl: number; // net profit/loss in USD
  payout: number; // gross payout (0 if lost)
  cost: number; // amount staked
  settledAt: number;
}

interface WalletState {
  cash: number;
  depositCount: number;
  nextDepositAt: number;
  stats?: PlayStats;
  positions?: Position[];
  tradeHistory?: HistoryEntry[];
  openOrders?: OpenOrder[];
}

export interface PricePoint {
  t: number;
  p: number;
}

interface ZoqoCtx {
  ready: boolean;
  source: string;
  connected: boolean;
  btc: number | null;
  snapshot: EngineSnapshot | null;
  priceSeries: PricePoint[];
  cash: number;
  positions: Position[];
  portfolioValue: number;
  netPnl: number;
  exposure: number;
  stats: PlayStats;
  openOrders: OpenOrder[];
  tradeHistory: HistoryEntry[];
  settlements: SettlementResult[];
  depositCount: number;
  nextDepositAt: number;
  depositAmount: number;
  deposit: () => boolean;
  grant: (amount: number) => void;
  /** Add or subtract cash directly — used by the Terminal's position engine
   *  (terminalStore.tsx) so paper-traded positions share this same wallet
   *  rather than keeping a second, disconnected cash balance. Clamped at 0. */
  adjustCash: (delta: number) => void;
  cancelOrder: (id: string) => void;
  dismissSettlement: (id: string) => void;
  placeLimitOrder: (marketId: string, side: Side, shares: number, limitPrice: number) => boolean;
  getMarket: (id: string) => Market | undefined;
  quote: (id: string) => { yes: number; no: number };
  buy: (marketId: string, side: Side, shares: number, price: number) => void;
  sell: (marketId: string, side: Side, shares?: number) => void;
}

const Ctx = React.createContext<ZoqoCtx | null>(null);

export function useZoqo() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useZoqo must be used within ZoqoProvider");
  return c;
}

export function ZoqoProvider({ children }: { children: React.ReactNode }) {
  const engineRef = React.useRef<MarketEngine | null>(null);
  const priceRef = React.useRef<number>(0);
  const seriesRef = React.useRef<PricePoint[]>([]);
  const cashRef = React.useRef(0);
  const ordersRef = React.useRef<OpenOrder[]>([]);
  const positionsRef = React.useRef<Position[]>([]);

  const [ready, setReady] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState<EngineSnapshot | null>(null);
  const [priceSeries, setPriceSeries] = React.useState<PricePoint[]>([]);
  const [cash, setCash] = React.useState(0);
  const [positions, setPositions] = React.useState<Position[]>([]);
  const [openOrders, setOpenOrders] = React.useState<OpenOrder[]>([]);
  const [tradeHistory, setTradeHistory] = React.useState<HistoryEntry[]>([]);
  const [depositCount, setDepositCount] = React.useState(0);
  const [nextDepositAt, setNextDepositAt] = React.useState(0);
  const [stats, setStats] = React.useState<PlayStats>(ZERO_STATS);
  const [settlements, setSettlements] = React.useState<SettlementResult[]>([]);
  // Render-safe fallback for `btc` before the live feed connects — mirrors
  // priceRef's bootstrap seed (real last-close from history) into state so
  // rendering never reads a ref directly (see the bootstrap effect below,
  // which sets both together in the same batch).
  const [seedPrice, setSeedPrice] = React.useState<number | null>(null);

  // Read the persisted wallet blob (SSR-safe: null on the server and the
  // client's first hydration-matching render, the real value right after).
  // Applied to the individual useState fields below via React's documented
  // "adjust state during render" pattern — a conditional setState call in
  // the render body, gated by comparing against state tracking what's
  // already been applied — instead of a setState-in-effect. See
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  //
  // walletLoaded comes from THIS SAME hook call, not a separate
  // useHasMounted() — two independent useSyncExternalStore hooks aren't
  // guaranteed to resolve from their SSR default to their real client value
  // on the same render pass. A previous version gated the persist effect
  // below on a separately-resolving "mounted" flag; on some loads that flag
  // flipped true before persistedWallet resolved to the real saved wallet,
  // so the persist effect fired once with the still-default cash=0 and
  // permanently clobbered the real balance. Keeping both on one snapshot
  // rules that out.
  const [persistedWallet, , walletLoaded] = useLocalStorageState<WalletState | null>(
    WALLET_KEY,
    null,
    (parsed) => parsed as WalletState,
  );
  const [appliedWallet, setAppliedWallet] = React.useState<WalletState | null>(null);
  if (persistedWallet && appliedWallet !== persistedWallet) {
    setAppliedWallet(persistedWallet);
    const w = persistedWallet;
    if (typeof w.cash === "number") setCash(w.cash);
    if (typeof w.depositCount === "number") setDepositCount(w.depositCount);
    if (typeof w.nextDepositAt === "number") setNextDepositAt(w.nextDepositAt);
    if (w.stats) setStats({ ...ZERO_STATS, ...w.stats });
    if (Array.isArray(w.positions)) setPositions(w.positions);
    if (Array.isArray(w.tradeHistory)) setTradeHistory(w.tradeHistory);
    if (Array.isArray(w.openOrders)) setOpenOrders(w.openOrders);
  }

  // Keep the ref mirrors in sync so the tick interval (a stable closure set
  // up once, see the simulation-loop effect below) always reads current
  // cash/orders/positions instead of a stale snapshot from when it started.
  React.useEffect(() => {
    cashRef.current = cash;
  }, [cash]);
  React.useEffect(() => {
    ordersRef.current = openOrders;
  }, [openOrders]);
  React.useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // Persist wallet (including real positions and history) whenever state changes.
  React.useEffect(() => {
    if (!walletLoaded) return;
    try {
      const userOrders = openOrders.filter((o) => o.userPlaced);
      localStorage.setItem(
        WALLET_KEY,
        JSON.stringify({
          cash,
          depositCount,
          nextDepositAt,
          stats,
          positions,
          tradeHistory: tradeHistory.slice(0, 200),
          openOrders: userOrders,
        } satisfies WalletState),
      );
    } catch {
      /* ignore */
    }
  }, [walletLoaded, cash, depositCount, nextDepositAt, stats, positions, tradeHistory, openOrders]);

  const grant = React.useCallback((amount: number) => {
    if (amount > 0) setCash((c) => c + amount);
  }, []);

  const adjustCash = React.useCallback((delta: number) => {
    setCash((c) => Math.max(0, c + delta));
  }, []);

  const deposit = React.useCallback((): boolean => {
    if (Date.now() < nextDepositAt) return false;
    const newCount = depositCount + 1;
    setCash((c) => c + DEPOSIT_AMOUNT);
    setDepositCount(newCount);
    setNextDepositAt(Date.now() + depositCooldownMs(newCount));
    return true;
  }, [depositCount, nextDepositAt]);

  const live = useLiveBtc(undefined, priceRef);

  // Bootstrap: fetch real BTC history → seed engine with real data.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { candles } = await fetchHistory("1m", 240);
      if (cancelled) return;
      const now = Date.now();
      const seed = (now ^ Math.floor(performance.now() * 1000)) >>> 0;
      const hist: Candle[] = candles.length ? candles : syntheticHistory(now);
      if (!priceRef.current) priceRef.current = hist.at(-1)?.c ?? 64000;
      setSeedPrice(priceRef.current);
      const engine = new MarketEngine({ history: hist, now, seed });
      engine.step(now, priceRef.current);
      engineRef.current = engine;
      seriesRef.current = hist.map((c) => ({ t: c.t, p: c.c }));
      setPriceSeries(seriesRef.current.slice());
      setSnapshot(engine.snapshot());
      // No fake seeds — start with only real user activity.
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once the engine is ready, clean up any persisted positions/orders whose
  // markets have since expired and been pruned from the engine (> 6 h old).
  // Refund the staked cost so the user isn't locked out of capital.
  React.useEffect(() => {
    if (!ready || !engineRef.current) return;
    const engine = engineRef.current;

    setPositions((prev) => {
      const orphaned = prev.filter((p) => !engine.marketById(p.marketId));
      if (orphaned.length === 0) return prev;
      const refund = orphaned.reduce((s, p) => s + p.cost, 0);
      if (refund > 0) setCash((c) => c + refund);
      return prev.filter((p) => !!engine.marketById(p.marketId));
    });

    setOpenOrders((prev) => {
      const orphaned = prev.filter((o) => o.userPlaced && !engine.marketById(o.marketId));
      if (orphaned.length === 0) return prev;
      const refund = orphaned.reduce((s, o) => s + o.shares * (o.limitPrice / 100), 0);
      if (refund > 0) setCash((c) => c + refund);
      return prev.filter((o) => !o.userPlaced || !!engine.marketById(o.marketId));
    });
  }, [ready]);

  /** Fill resting limit orders and settle positions whose market has closed.
   *  Runs each tick off the ref mirrors to avoid stale closures. Declared
   *  before the simulation-loop effect below (which calls it) so its source
   *  order matches evaluation order — a `[]`-deps useCallback, so hoisting
   *  it here is a pure reordering with no behavior change. */
  const processOrdersAndSettlement = React.useCallback(
    (engine: MarketEngine, now: number) => {
      // 1) limit-order fills
      const orders = ordersRef.current;
      const filled: OpenOrder[] = [];
      for (const o of orders) {
        if (!o.userPlaced) continue;
        const m = engine.marketById(o.marketId);
        if (!m || m.status !== "live") continue;
        const sidePrice = o.side === "up" ? m.yes : 100 - m.yes;
        if (sidePrice <= o.limitPrice) filled.push(o);
      }
      if (filled.length) {
        const ids = new Set(filled.map((f) => f.id));
        setPositions((prev) => {
          const next = prev.slice();
          for (const o of filled) {
            const cost = o.shares * (o.limitPrice / 100);
            const i = next.findIndex((p) => p.marketId === o.marketId && p.side === o.side);
            if (i >= 0) {
              const ex = next[i];
              const ts = ex.shares + o.shares;
              next[i] = {
                ...ex,
                shares: ts,
                cost: ex.cost + cost,
                avgPrice: round1((ex.avgPrice * ex.shares + o.limitPrice * o.shares) / ts),
              };
            } else {
              next.push({ marketId: o.marketId, side: o.side, shares: o.shares, avgPrice: o.limitPrice, cost, openedAt: now });
            }
            engine.applyUserTrade(o.marketId, o.side, o.shares, o.limitPrice);
          }
          return next;
        });
        setOpenOrders((prev) => prev.filter((o) => !ids.has(o.id)));
        setStats((s) => ({ ...s, tradesPlaced: s.tradesPlaced + filled.length }));
      }

      // 2) expire user orders on settled markets → refund reserved cash
      const expired = ordersRef.current.filter((o) => {
        const m = engine.marketById(o.marketId);
        return o.userPlaced && m && m.status === "settled";
      });
      if (expired.length) {
        const refund = expired.reduce((s, o) => s + o.shares * (o.limitPrice / 100), 0);
        const ids = new Set(expired.map((o) => o.id));
        setCash((c) => c + refund);
        setOpenOrders((prev) => prev.filter((o) => !ids.has(o.id)));
      }

      // 3) settle positions whose market has closed — pay $1/winning share
      const poss = positionsRef.current;
      const toSettle = poss.filter((p) => {
        const m = engine.marketById(p.marketId);
        return m && m.status === "settled";
      });
      if (toSettle.length) {
        let payout = 0;
        const hist: HistoryEntry[] = [];
        const newSettlements: SettlementResult[] = [];
        for (const p of toSettle) {
          const m = engine.marketById(p.marketId)!;
          const won = p.side === "up" ? !!m.settledUp : !m.settledUp;
          const pay = won ? p.shares : 0;
          payout += pay;
          hist.push({
            id: `settle-${p.marketId}-${p.side}-${p.openedAt}`,
            label: m.label,
            strike: m.strike,
            closePrice: m.lastPrice,
            side: p.side,
            shares: p.shares,
            entryPrice: p.avgPrice,
            exitPrice: won ? 100 : 0,
            pnl: pay - p.cost,
            result: won ? "won" : "lost",
            closedAt: m.closeTime,
          });
          newSettlements.push({
            id: `settle-${p.marketId}-${p.side}-${p.openedAt}`,
            marketLabel: m.label,
            strike: m.strike,
            closePrice: m.lastPrice,
            side: p.side,
            won,
            pnl: pay - p.cost,
            payout: pay,
            cost: p.cost,
            settledAt: m.closeTime,
          });
        }
        if (payout > 0) setCash((c) => c + payout);
        const keys = new Set(toSettle.map((p) => `${p.marketId}|${p.side}`));
        setPositions((prev) => prev.filter((p) => !keys.has(`${p.marketId}|${p.side}`)));
        setTradeHistory((prev) => [...hist, ...prev].slice(0, 200));
        const w = hist.filter((h) => h.result === "won").length;
        const best = Math.max(0, ...hist.map((h) => h.pnl));
        setStats((s) => ({
          ...s,
          wins: s.wins + w,
          losses: s.losses + (hist.length - w),
          bestPnl: Math.max(s.bestPnl, best),
        }));
        if (newSettlements.length > 0) {
          setSettlements((prev) => [...newSettlements, ...prev].slice(0, 5));
        }
      }
    },
    [],
  );

  // Simulation loop — 600 ms ticks driven by the real BTC price.
  React.useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const now = Date.now();
      const price = priceRef.current || engine.lastPrice;
      engine.step(now, price);
      const series = seriesRef.current;
      const last = series.at(-1);
      if (!last || now - last.t > 800 || Math.abs(price - last.p) > 0.01) {
        series.push({ t: now, p: price });
        if (series.length > 420) series.shift();
      }
      setPriceSeries(series.slice());
      setSnapshot(engine.snapshot());
      processOrdersAndSettlement(engine, now);
    }, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const dismissSettlement = React.useCallback((id: string) => {
    setSettlements((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const cancelOrder = React.useCallback((id: string) => {
    setOpenOrders((prev) => {
      const o = prev.find((x) => x.id === id);
      if (o?.userPlaced) setCash((c) => c + o.shares * (o.limitPrice / 100));
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const placeLimitOrder = React.useCallback(
    (marketId: string, side: Side, shares: number, limitPrice: number): boolean => {
      const cost = shares * (limitPrice / 100);
      if (shares <= 0 || cost > cashRef.current) return false;
      const m = engineRef.current?.marketById(marketId);
      if (!m) return false;
      setCash((c) => c - cost);
      setOpenOrders((prev) => [
        {
          id: `lim-${Date.now().toString(36)}-${prev.length}`,
          marketId,
          label: m.label,
          strike: m.strike,
          side,
          shares: Math.round(shares),
          limitPrice: round1(limitPrice),
          filledPct: 0,
          placedAt: Date.now(),
          status: "working" as const,
          userPlaced: true,
        },
        ...prev,
      ]);
      return true;
    },
    [],
  );

  const getMarket = React.useCallback(
    (id: string) => engineRef.current?.marketById(id),
    [],
  );

  const quote = React.useCallback(
    (id: string) => {
      const m = engineRef.current?.marketById(id);
      const yes = m ? m.yes : 50;
      return { yes, no: round1(100 - yes) };
    },
    [],
  );

  const buy = React.useCallback(
    (marketId: string, side: Side, shares: number, price: number) => {
      const cost = shares * (price / 100);
      setCash((c) => Math.max(0, c - cost));
      setPositions((prev) => {
        const i = prev.findIndex((p) => p.marketId === marketId && p.side === side);
        if (i >= 0) {
          const ex = prev[i];
          const totalShares = ex.shares + shares;
          const merged: Position = {
            ...ex,
            shares: totalShares,
            cost: ex.cost + cost,
            avgPrice: round1((ex.avgPrice * ex.shares + price * shares) / totalShares),
          };
          const next = prev.slice();
          next[i] = merged;
          return next;
        }
        return [
          ...prev,
          { marketId, side, shares, avgPrice: round1(price), cost, openedAt: Date.now() },
        ];
      });
      engineRef.current?.applyUserTrade(marketId, side, shares, price);
      setStats((s) => ({ ...s, tradesPlaced: s.tradesPlaced + 1 }));
    },
    [],
  );

  const sell = React.useCallback(
    (marketId: string, side: Side, shares?: number) => {
      setPositions((prev) => {
        const i = prev.findIndex((p) => p.marketId === marketId && p.side === side);
        if (i < 0) return prev;
        const pos = prev[i];
        const m = engineRef.current?.marketById(marketId);
        const px = m ? (side === "up" ? m.yes : 100 - m.yes) : pos.avgPrice;
        const sellShares = Math.min(pos.shares, shares ?? pos.shares);
        const proceeds = sellShares * (px / 100);
        setCash((c) => c + proceeds);
        const soldCost = pos.cost * (sellShares / pos.shares);
        setTradeHistory((h) => [
          {
            id: `h-${Date.now().toString(36)}`,
            label: m?.label ?? "—",
            strike: m?.strike ?? 0,
            side,
            shares: sellShares,
            entryPrice: pos.avgPrice,
            exitPrice: round1(px),
            pnl: proceeds - soldCost,
            result: "closed" as const,
            closedAt: Date.now(),
          },
          ...h,
        ]);
        engineRef.current?.applyUserTrade(marketId, side === "up" ? "down" : "up", sellShares, 100 - px);
        const remaining = pos.shares - sellShares;
        const next = prev.slice();
        if (remaining <= 0) next.splice(i, 1);
        else
          next[i] = {
            ...pos,
            shares: remaining,
            cost: pos.cost * (remaining / pos.shares),
          };
        return next;
      });
    },
    [],
  );

  const { portfolioValue, netPnl, exposure } = React.useMemo(() => {
    // Reads from `snapshot` (the tick-synced state), not the live engine
    // ref — same underlying data at the same tick (snapshot().markets is
    // built from the same map marketById reads), but state-safe during
    // render instead of reaching into a ref.
    const marketMap = new Map(snapshot?.markets.map((m) => [m.id, m]) ?? []);
    let posValue = 0;
    let cost = 0;
    for (const p of positions) {
      const m = marketMap.get(p.marketId);
      const yes = m ? m.yes : p.avgPrice;
      const px = p.side === "up" ? yes : 100 - yes;
      posValue += p.shares * (px / 100);
      cost += p.cost;
    }
    return {
      portfolioValue: cash + posValue,
      netPnl: posValue - cost,
      exposure: cost,
    };
  }, [positions, cash, snapshot]);

  const value: ZoqoCtx = {
    ready,
    source: live.source,
    connected: live.connected,
    btc: live.price ?? seedPrice,
    snapshot,
    priceSeries,
    cash,
    positions,
    portfolioValue,
    netPnl,
    exposure,
    stats,
    openOrders,
    tradeHistory,
    settlements,
    depositCount,
    nextDepositAt,
    depositAmount: DEPOSIT_AMOUNT,
    deposit,
    grant,
    adjustCash,
    cancelOrder,
    dismissSettlement,
    placeLimitOrder,
    getMarket,
    quote,
    buy,
    sell,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Fallback if every price source is unreachable — a gentle random walk. */
function syntheticHistory(now: number): Candle[] {
  const out: Candle[] = [];
  let p = 64000;
  for (let i = 240; i > 0; i--) {
    const t = now - i * 60_000;
    const drift = (Math.sin(i / 12) + (Math.random() - 0.5)) * 40;
    const o = p;
    p = Math.max(1000, p + drift);
    out.push({ t, o, h: Math.max(o, p) + 10, l: Math.min(o, p) - 10, c: p, v: 1 });
  }
  return out;
}
