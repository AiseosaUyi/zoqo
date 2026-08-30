"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { Button } from "@/components/ui";
import { useZoqo } from "@/lib/store";
import { TerminalProvider, useTerminal } from "@/lib/terminalStore";
import { useAssetPrice } from "@/lib/useAssetPrice";
import { useTicker } from "@/lib/useTicker";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useHiddenPanels, useRowOrder, ssrSafeLayoutStorage } from "@/lib/terminalLayout";
import { ASSETS, ASSET_BY_ID, DEFAULT_ASSET_ID } from "@/lib/assets";
import { Watchlist } from "./Watchlist";
import { OrderTicket } from "./OrderTicket";
import { DataTablesPanel } from "./DataTablesPanel";
import { TerminalOrderBook } from "./TerminalOrderBook";
import { TerminalChart, type TerminalChartHandle } from "./TerminalChart";
import { TerminalPanel } from "./TerminalPanel";
import { PanelsMenu } from "./PanelsMenu";
import { TerminalStatusBar } from "./TerminalStatusBar";
import { MobileAssetCarousel } from "./MobileAssetCarousel";
import { MobileTerminalBar, MOBILE_TERMINAL_CONTENT_SAFE_PADDING } from "./MobileTerminalBar";
import { cn } from "@/lib/cn";
import { usd, signedUsd, price as formatPrice } from "@/lib/format";
import { seedCandles1m, upsertTick, type Candle } from "@/lib/candles";
import {
  getPendingMockTrade,
  clearPendingMockTrade,
  setMockTradeResult,
  type MockTradePending,
} from "@/lib/mockTrade";

const ROW1_PANEL_IDS = ["watchlist", "chart", "orderbook", "orderticket"];
const PANEL_LABELS: Record<string, string> = {
  watchlist: "Watchlist",
  chart: "Chart",
  orderbook: "Order Book",
  orderticket: "Trade Form",
  dataTables: "Data Tables",
};

function resetTerminalLayout() {
  try {
    localStorage.removeItem("react-resizable-panels:terminal-root");
    localStorage.removeItem("react-resizable-panels:terminal-row1");
    localStorage.removeItem("zoqo-terminal-hidden-panels-v1");
    localStorage.removeItem("zoqo-terminal-row1-order-v1");
  } catch {
    /* ignore */
  }
  window.location.reload();
}

// Candles are maintained incrementally (candles.ts's upsertTick), not
// rebucketed from a raw tick list — that was the old approach and it's what
// produced the "solid block" bug: a short tick window collapses to one
// degenerate candle for a fast ticker like BTC, and fitContent() then
// stretches that single candle to fill the whole panel. Maintaining O(1)
// 1-minute candles instead means the buffer size is bounded by candle count,
// not tick volume, so it's safe to keep a much longer history — capped here
// at a day, which comfortably covers the H1 timeframe. New assets are seeded
// with synthetic backward history (seedCandles1m) so the chart is populated
// immediately instead of needing real time to pass before it has more than
// one candle.
const MAX_CANDLES = 24 * 60;
const SEED_CANDLES = 8 * 60;

// Resolves a pending Mock Trade against sessionStorage for a given lesson
// id. Deliberately takes the id as a parameter rather than reading
// `window.location.search` itself — a real browser test (Playwright) showed
// `window.location.search` lags behind Next.js's own router-managed
// `useSearchParams()` during a client-side transition (the URL bar/history
// entry updates before `window.location` reflects it), so a fresh mount's
// very first render could observe the *old* URL and silently find nothing
// even though the target route genuinely has ?mockLesson=. useSearchParams()
// is the reliable source; this function only does the sessionStorage half.
function resolvePendingMockTrade(lessonId: string | null): MockTradePending | null {
  if (!lessonId) return null;
  const pending = getPendingMockTrade();
  return pending && pending.lessonId === lessonId ? pending : null;
}

/** Multi-asset trading terminal — desktop: watchlist / chart / order ticket
 *  three-column layout with a positions panel underneath, mirroring the
 *  MT5-style IA described in TERMINAL_SPEC.md §5. Mobile gets a stacked
 *  single column with the order ticket promoted to a bottom sheet (see
 *  MobileOrderSheet — not yet wired here, flagged in the handoff prompt:
 *  this pass proves the desktop shell and the shared data layer first). */
export function TerminalShell() {
  return (
    <TerminalProvider>
      <TerminalInner />
    </TerminalProvider>
  );
}

function TerminalInner() {
  const router = useRouter();
  // Academy's Mock Trade lesson (spec §6) deep-links here with ?mockLesson=id
  // and a matching sessionStorage record (mockTrade.ts) — useSearchParams()
  // is the one reliable source for that id, both on a fresh mount and when
  // navigating back here a second time without remounting (see
  // resolvePendingMockTrade's comment for why window.location.search isn't).
  const searchParams = useSearchParams();
  const mockLessonParam = searchParams.get("mockLesson");
  const { cash } = useZoqo();
  const { positions, orders, openPosition, markToMarket, checkStops, placeLimitOrder, checkLimitOrders } =
    useTerminal();
  const [activeMock, setActiveMock] = React.useState<MockTradePending | null>(() =>
    resolvePendingMockTrade(mockLessonParam),
  );
  const [mockGraded, setMockGraded] = React.useState(false);
  const [assetId, setAssetId] = React.useState(
    () => resolvePendingMockTrade(mockLessonParam)?.assetId ?? DEFAULT_ASSET_ID,
  );
  const [candlesByAsset, setCandlesByAsset] = React.useState<Record<string, Candle[]>>({});

  // React's "adjust state during render" pattern (see store.tsx's
  // persistedWallet/appliedWallet for the same shape) rather than an
  // effect — appliedMockLessonParam starts equal to the current param so
  // this only fires on a genuine *change* (a second ?mockLesson= navigation
  // without remounting), not redundantly on first mount, which the lazy
  // initializers above already cover.
  const [appliedMockLessonParam, setAppliedMockLessonParam] = React.useState(mockLessonParam);
  if (mockLessonParam && mockLessonParam !== appliedMockLessonParam) {
    setAppliedMockLessonParam(mockLessonParam);
    const pending = resolvePendingMockTrade(mockLessonParam);
    if (pending) {
      setActiveMock(pending);
      setAssetId(pending.assetId);
      setMockGraded(false);
    }
  }

  const [toast, setToast] = React.useState<{ id: number; text: string; tone: "up" | "down" } | null>(null);
  const toastIdRef = React.useRef(0);
  const showToast = React.useCallback((text: string, tone: "up" | "down") => {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, text, tone });
  }, []);
  React.useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const timer = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Subscribe to every asset's live price at once (cheap — a handful of
  // symbols) so the watchlist and mark-to-market P&L stay live regardless
  // of which symbol is charted.
  const prices: Record<string, ReturnType<typeof useAssetPriceSafe>> = {};
  for (const a of ASSETS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    prices[a.id] = useAssetPriceSafe(a.id);
  }

  const activePrice = prices[assetId]?.price ?? null;
  // useTicker instead of Date.now() for the tick timestamp below — it's
  // read via useSyncExternalStore (render-pure), whereas Date.now() called
  // directly in the render body is flagged as impure. 250ms is well under
  // real price-update cadence, so no precision loss the chart would show
  // (it buckets ticks into coarser candles anyway).
  const nowMs = useTicker(250);

  // Append a tick whenever the active asset's live price actually changes —
  // React's "adjust state during render" pattern (comparing against state
  // tracking the last-seen price), not an effect, so there's no setState
  // call outside a handler/callback.
  const [lastTick, setLastTick] = React.useState<{ assetId: string; price: number; at: number } | null>(null);
  if (activePrice != null && (!lastTick || lastTick.assetId !== assetId || lastTick.price !== activePrice)) {
    setLastTick({ assetId, price: activePrice, at: nowMs });
    setCandlesByAsset((prev) => {
      const existing = prev[assetId];
      const base = existing && existing.length > 0 ? existing : seedCandles1m(assetId, activePrice, nowMs, SEED_CANDLES);
      return { ...prev, [assetId]: upsertTick(base, nowMs, activePrice, MAX_CANDLES) };
    });
  }
  // "Feed" age for the status bar — ms since the active asset's price last
  // genuinely changed, not a fabricated network ping (ZOQO has no way to
  // measure real round-trip latency to an upstream exchange).
  const feedAgeMs = lastTick && lastTick.assetId === assetId ? Math.max(0, nowMs - lastTick.at) : null;

  const priceMap: Record<string, number | null> = {};
  for (const a of ASSETS) priceMap[a.id] = prices[a.id]?.price ?? null;
  const priceMapForMtm: Record<string, number> = {};
  for (const k in priceMap) if (priceMap[k]) priceMapForMtm[k] = priceMap[k]!;
  const { unrealizedPnl, equity } = markToMarket(priceMapForMtm);

  const longsNotional = positions
    .filter((p) => p.side === "long")
    .reduce((s, p) => s + p.qty * (priceMap[p.assetId] ?? p.entryPrice), 0);
  const shortsNotional = positions
    .filter((p) => p.side === "short")
    .reduce((s, p) => s + p.qty * (priceMap[p.assetId] ?? p.entryPrice), 0);
  const ordersNotional = orders.reduce((s, o) => s + o.qty * o.limitPrice, 0);

  // Stop-loss/take-profit are stored on the position when a trade opens but
  // otherwise inert — nothing was ever checking a resting position's mark
  // against them, so they didn't actually protect anyone. This is the
  // execution side: watch every live mark each tick and auto-close (filling
  // at the SL/TP level, not the possibly-gapped mark) anything breached.
  React.useEffect(() => {
    const triggered = checkStops(priceMapForMtm);
    for (const t of triggered) {
      const asset = ASSET_BY_ID[t.assetId];
      const label = t.reason === "stop-loss" ? "Stop-loss hit" : "Take-profit hit";
      showToast(`${label} — ${asset?.symbol ?? t.assetId} closed ${signedUsd(t.pnl)}`, t.pnl >= 0 ? "up" : "down");
    }
    const filled = checkLimitOrders(priceMapForMtm);
    for (const f of filled) {
      const asset = ASSET_BY_ID[f.assetId];
      const decimals = asset?.decimals ?? 2;
      showToast(
        `Limit order filled — ${f.side === "long" ? "bought" : "sold"} ${asset?.symbol ?? f.assetId} @ ${formatPrice(f.price, decimals)}`,
        f.side === "long" ? "up" : "down",
      );
    }
    // priceMapForMtm is a fresh object every render by construction (same as
    // the pre-existing priceMap/markToMarket call above) — that's intentional
    // here, it's what drives checking on every price tick rather than once.
  }, [priceMapForMtm, checkStops, checkLimitOrders, showToast]);

  const submitOrder = (
    side: "long" | "short",
    qty: number,
    opts?: {
      stopLoss?: number;
      takeProfit?: number;
      orderType?: "market" | "limit";
      limitPrice?: number;
      reduceOnly?: boolean;
    },
  ) => {
    const asset = ASSET_BY_ID[assetId];
    const decimals = asset?.decimals ?? 2;

    if (opts?.orderType === "limit") {
      if (!opts.limitPrice) return false;
      const ok = placeLimitOrder(assetId, side, qty, opts.limitPrice, {
        stopLoss: opts.stopLoss,
        takeProfit: opts.takeProfit,
        reduceOnly: opts.reduceOnly,
      });
      if (ok) {
        showToast(
          `Limit order placed — ${side === "long" ? "buy" : "sell"} ${asset?.symbol ?? assetId} @ ${formatPrice(opts.limitPrice, decimals)}`,
          side === "long" ? "up" : "down",
        );
      }
      return ok;
    }

    if (!activePrice) return false;
    const ok = openPosition(assetId, side, qty, activePrice, {
      stopLoss: opts?.stopLoss,
      takeProfit: opts?.takeProfit,
      reduceOnly: opts?.reduceOnly,
    });
    if (ok) {
      showToast(
        `${side === "long" ? "Bought" : "Sold"} ${asset?.symbol ?? assetId} @ ${formatPrice(activePrice, decimals)}`,
        side === "long" ? "up" : "down",
      );

      if (activeMock && activeMock.assetId === assetId && !mockGraded) {
        const sizePct = cash > 0 ? ((qty * activePrice) / cash) * 100 : 0;
        const slPct = opts?.stopLoss != null ? (Math.abs(activePrice - opts.stopLoss) / activePrice) * 100 : null;
        const tpPct = opts?.takeProfit != null ? (Math.abs(opts.takeProfit - activePrice) / activePrice) * 100 : null;
        const inRange = (v: number, range: { min: number; max: number }) => v >= range.min && v <= range.max;
        setMockTradeResult({
          lessonId: activeMock.lessonId,
          sideOk: side === activeMock.requiredSide,
          sizeOk: inRange(sizePct, activeMock.sizePctRange),
          slOk: slPct != null && inRange(slPct, activeMock.stopLossPctRange),
          tpOk: tpPct != null && inRange(tpPct, activeMock.takeProfitPctRange),
        });
        clearPendingMockTrade();
        setMockGraded(true);
      }
    }
    return ok;
  };

  const isDesktop = useIsDesktop();
  const { hidden, isHidden, hide, show } = useHiddenPanels();
  const { order: row1Order, moveBefore } = useRowOrder(ROW1_PANEL_IDS);
  const dragIdRef = React.useRef<string | null>(null);
  const chartHandleRef = React.useRef<TerminalChartHandle>(null);
  const rootLayout = useDefaultLayout({ id: "terminal-root", storage: ssrSafeLayoutStorage });
  const row1Layout = useDefaultLayout({ id: "terminal-row1", storage: ssrSafeLayoutStorage });

  const handleChartScreenshot = () => {
    const canvas = chartHandleRef.current?.screenshot();
    if (!canvas) return;
    const asset = ASSET_BY_ID[assetId];
    const link = document.createElement("a");
    link.download = `zoqo-${asset?.id ?? assetId}-chart.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const chartEl = (
    <TerminalChart
      ref={chartHandleRef}
      assetId={assetId}
      candles={candlesByAsset[assetId] ?? []}
      source={prices[assetId]?.source}
      connected={prices[assetId]?.connected}
    />
  );
  const dataTablesEl = (
    <DataTablesPanel prices={priceMap} cash={cash} equity={equity} unrealizedPnl={unrealizedPnl} />
  );

  const ROW1_CONFIG: Record<string, { defaultSize: number; minSize: number; node: React.ReactNode }> = {
    watchlist: {
      defaultSize: 15,
      minSize: 10,
      node: <Watchlist activeId={assetId} onSelect={setAssetId} prices={prices} />,
    },
    chart: { defaultSize: 45, minSize: 20, node: chartEl },
    orderbook: {
      defaultSize: 20,
      minSize: 14,
      node: <TerminalOrderBook assetId={assetId} price={activePrice} />,
    },
    orderticket: {
      defaultSize: 20,
      minSize: 16,
      node: (
        <OrderTicket
          assetId={assetId}
          price={activePrice}
          cash={cash}
          onSubmit={submitOrder}
          source={prices[assetId]?.source}
          connected={prices[assetId]?.connected}
        />
      ),
    },
  };

  return (
    <div className="relative flex h-[calc(100vh-56px)] flex-col">
      {toast && (
        <div
          className={`pointer-events-none absolute top-3 right-3 z-20 rounded-chip px-3 py-2 text-[12px] font-semibold text-white shadow-lg ${
            toast.tone === "up" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}
      {activeMock && (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-purple-50 px-4 py-2 text-[12px]">
          {mockGraded ? (
            <>
              <span className="font-semibold text-purple-800">✓ Trade graded — head back to see how it went.</span>
              <Button
                size="xs"
                color="brand"
                onClick={() => router.push(`/learn?resumeLesson=${encodeURIComponent(activeMock.lessonId)}`)}
              >
                Back to Academy
              </Button>
            </>
          ) : (
            <>
              <span className="text-purple-800">
                <span className="font-semibold">Academy:</span> {activeMock.instructions}
              </span>
              <Button
                size="xs"
                variant="outline"
                color="gray"
                onClick={() => {
                  clearPendingMockTrade();
                  setActiveMock(null);
                }}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <div className="flex gap-6">
          <Stat label="Equity" value={usd(equity)} />
          <Stat label="Cash" value={usd(cash)} />
          <Stat
            label="Unrealized P&L"
            value={signedUsd(unrealizedPnl)}
            tone={unrealizedPnl >= 0 ? "up" : "down"}
          />
        </div>
        {isDesktop && (
          <div className="flex items-center gap-2">
            <PanelsMenu
              panels={[...ROW1_PANEL_IDS, "dataTables"].map((id) => ({ id, label: PANEL_LABELS[id] }))}
              hidden={hidden}
              onShow={show}
            />
            <button
              type="button"
              onClick={resetTerminalLayout}
              className="rounded-chip border border-line px-2.5 py-1 text-[11.5px] font-semibold text-sub transition-colors hover:text-ink"
            >
              Reset Layout
            </button>
          </div>
        )}
      </div>

      {/* Mobile: swipeable symbol strip above the chart (TERMINAL_SPEC.md §5 —
          "a swipeable horizontal carousel, not a dropdown"). Hidden at lg+,
          where the Watchlist sidebar already covers symbol switching. */}
      <div className="border-b border-line lg:hidden">
        <MobileAssetCarousel activeId={assetId} onSelect={setAssetId} prices={prices} />
      </div>

      {isDesktop ? (
        <Group
          id="terminal-root"
          orientation="vertical"
          defaultLayout={rootLayout.defaultLayout}
          onLayoutChanged={rootLayout.onLayoutChanged}
          className="flex-1 overflow-hidden"
        >
          <Panel id="row1" defaultSize={isHidden("dataTables") ? 100 : 70} minSize={30}>
            <Group
              id="terminal-row1"
              orientation="horizontal"
              defaultLayout={row1Layout.defaultLayout}
              onLayoutChanged={row1Layout.onLayoutChanged}
              className="h-full"
            >
              {row1Order
                .filter((id) => !isHidden(id))
                .map((id, i) => {
                  const cfg = ROW1_CONFIG[id];
                  return (
                    <React.Fragment key={id}>
                      {i > 0 && <Separator className="w-1 shrink-0 bg-line transition-colors hover:bg-purple-200" />}
                      <TerminalPanel
                        id={id}
                        title={PANEL_LABELS[id]}
                        defaultSize={cfg.defaultSize}
                        minSize={cfg.minSize}
                        onClose={() => hide(id)}
                        onRefresh={id === "chart" ? () => chartHandleRef.current?.fitContent() : undefined}
                        onScreenshot={id === "chart" ? handleChartScreenshot : undefined}
                        draggable
                        onDragStart={() => {
                          dragIdRef.current = id;
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragIdRef.current) moveBefore(dragIdRef.current, id);
                          dragIdRef.current = null;
                        }}
                      >
                        {cfg.node}
                      </TerminalPanel>
                    </React.Fragment>
                  );
                })}
            </Group>
          </Panel>
          {!isHidden("dataTables") && (
            <>
              <Separator className="h-1 shrink-0 bg-line transition-colors hover:bg-purple-200" />
              <TerminalPanel id="dataTables" title="Data Tables" defaultSize={30} minSize={15} onClose={() => hide("dataTables")}>
                {dataTablesEl}
              </TerminalPanel>
            </>
          )}
        </Group>
      ) : (
        <div className={cn("grid flex-1 grid-cols-1 overflow-hidden", MOBILE_TERMINAL_CONTENT_SAFE_PADDING)}>
          <div className="flex flex-col overflow-hidden">
            <div className="min-h-[280px] flex-1">{chartEl}</div>
            <div className="h-[260px] border-t border-line">{dataTablesEl}</div>
          </div>
        </div>
      )}

      <TerminalStatusBar
        openCount={positions.length}
        longsNotional={longsNotional}
        shortsNotional={shortsNotional}
        unrealizedPnl={unrealizedPnl}
        ordersCount={orders.length}
        ordersNotional={ordersNotional}
        feedAgeMs={feedAgeMs}
      />

      {/* Mobile: sticky Long/Short bar + slide-up order ticket sheet, docked
          at the screen's true bottom edge — generalized from
          MobileTradeBar's pattern (src/components/trade/MobileTradeBar.tsx). */}
      <MobileTerminalBar assetId={assetId} price={activePrice} cash={cash} onSubmit={submitOrder} />
    </div>
  );
}

function useAssetPriceSafe(assetId: string) {
  // Thin re-export point so TerminalInner's hook-in-loop call site (above)
  // stays readable; ESLint's rules-of-hooks is suppressed there deliberately
  // — ASSETS is a static module-level constant so the hook count/order never
  // changes between renders, which is what that rule actually protects
  // against. This wrapper itself calls the hook normally, no suppression needed.
  return useAssetPrice(assetId);
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex flex-col leading-none">
      <span className="text-[11px] text-sub">{label}</span>
      <span
        className={`mt-1 text-[14px] font-bold nums ${
          tone === "up" ? "text-green-600" : tone === "down" ? "text-red-600" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
