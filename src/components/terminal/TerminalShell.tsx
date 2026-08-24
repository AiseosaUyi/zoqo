"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useZoqo } from "@/lib/store";
import { TerminalProvider, useTerminal } from "@/lib/terminalStore";
import { useAssetPrice } from "@/lib/useAssetPrice";
import { useTicker } from "@/lib/useTicker";
import { ASSETS, ASSET_BY_ID, DEFAULT_ASSET_ID } from "@/lib/assets";
import { Watchlist } from "./Watchlist";
import { OrderTicket } from "./OrderTicket";
import { PositionsPanel } from "./PositionsPanel";
import { TerminalChart } from "./TerminalChart";
import { usd, signedUsd, price as formatPrice } from "@/lib/format";
import { seedCandles1m, upsertTick, type Candle } from "@/lib/candles";
import {
  getPendingMockTrade,
  clearPendingMockTrade,
  setMockTradeResult,
  type MockTradePending,
} from "@/lib/mockTrade";

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

// Read once, lazily, inside a useState initializer rather than an effect —
// this repo's React Compiler lint rules (react-hooks/set-state-in-effect,
// see CLAUDE.md) flag calling setState synchronously inside an effect body,
// and a lazy initializer is the correct "read an external system once at
// mount" shape besides. Guarded for SSR/static prerendering, where
// `window` doesn't exist yet — the real read only ever resolves client-side.
function readActiveMockFromUrl(): MockTradePending | null {
  if (typeof window === "undefined") return null;
  const lessonId = new URLSearchParams(window.location.search).get("mockLesson");
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
  const { cash } = useZoqo();
  const { openPosition, markToMarket, checkStops } = useTerminal();
  // Academy's Mock Trade lesson (spec §6) deep-links here with ?mockLesson=id
  // and a matching sessionStorage record (mockTrade.ts) — read once via a
  // lazy initializer (see readActiveMockFromUrl above) rather than
  // useSearchParams(), so this component doesn't force a Suspense boundary
  // onto an otherwise-static page just for a param only the Academy
  // hand-off ever sets.
  const [activeMock, setActiveMock] = React.useState<MockTradePending | null>(readActiveMockFromUrl);
  const [mockGraded, setMockGraded] = React.useState(false);
  const [assetId, setAssetId] = React.useState(() => readActiveMockFromUrl()?.assetId ?? DEFAULT_ASSET_ID);
  const [candlesByAsset, setCandlesByAsset] = React.useState<Record<string, Candle[]>>({});

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
  const [lastTick, setLastTick] = React.useState<{ assetId: string; price: number } | null>(null);
  if (activePrice != null && (!lastTick || lastTick.assetId !== assetId || lastTick.price !== activePrice)) {
    setLastTick({ assetId, price: activePrice });
    setCandlesByAsset((prev) => {
      const existing = prev[assetId];
      const base = existing && existing.length > 0 ? existing : seedCandles1m(assetId, activePrice, nowMs, SEED_CANDLES);
      return { ...prev, [assetId]: upsertTick(base, nowMs, activePrice, MAX_CANDLES) };
    });
  }

  const priceMap: Record<string, number | null> = {};
  for (const a of ASSETS) priceMap[a.id] = prices[a.id]?.price ?? null;
  const priceMapForMtm: Record<string, number> = {};
  for (const k in priceMap) if (priceMap[k]) priceMapForMtm[k] = priceMap[k]!;
  const { unrealizedPnl, equity } = markToMarket(priceMapForMtm);

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
    // priceMapForMtm is a fresh object every render by construction (same as
    // the pre-existing priceMap/markToMarket call above) — that's intentional
    // here, it's what drives checking on every price tick rather than once.
  }, [priceMapForMtm, checkStops, showToast]);

  const submitOrder = (side: "long" | "short", qty: number, sl?: number, tp?: number) => {
    if (!activePrice) return false;
    const ok = openPosition(assetId, side, qty, activePrice, { stopLoss: sl, takeProfit: tp });
    if (ok) {
      const asset = ASSET_BY_ID[assetId];
      const decimals = asset?.decimals ?? 2;
      showToast(
        `${side === "long" ? "Bought" : "Sold"} ${asset?.symbol ?? assetId} @ ${formatPrice(activePrice, decimals)}`,
        side === "long" ? "up" : "down",
      );

      if (activeMock && activeMock.assetId === assetId && !mockGraded) {
        const sizeUsd = qty * activePrice;
        const slPct = sl != null ? (Math.abs(activePrice - sl) / activePrice) * 100 : null;
        const tpPct = tp != null ? (Math.abs(tp - activePrice) / activePrice) * 100 : null;
        const inRange = (v: number, range: { min: number; max: number }) => v >= range.min && v <= range.max;
        setMockTradeResult({
          lessonId: activeMock.lessonId,
          sideOk: side === activeMock.requiredSide,
          sizeOk: inRange(sizeUsd, activeMock.sizeUsdRange),
          slOk: slPct != null && inRange(slPct, activeMock.stopLossPctRange),
          tpOk: tpPct != null && inRange(tpPct, activeMock.takeProfitPctRange),
        });
        clearPendingMockTrade();
        setMockGraded(true);
      }
    }
    return ok;
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
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[220px_1fr_280px]">
        <div className="hidden border-r border-line lg:block">
          <Watchlist activeId={assetId} onSelect={setAssetId} prices={prices} />
        </div>

        <div className="flex flex-col overflow-hidden">
          <div className="min-h-[280px] flex-1">
            <TerminalChart assetId={assetId} candles={candlesByAsset[assetId] ?? []} />
          </div>
          <div className="h-[220px] border-t border-line">
            <PositionsPanel prices={priceMap} />
          </div>
        </div>

        <div className="hidden border-l border-line lg:block">
          <OrderTicket
            assetId={assetId}
            price={activePrice}
            cash={cash}
            onSubmit={submitOrder}
          />
        </div>
      </div>

      {/* Mobile: symbol picker + ticket surface below the chart, single column. */}
      <div className="border-t border-line p-3 lg:hidden">
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          className="mb-3 h-10 w-full rounded-chip border border-line px-3 text-[13px] font-semibold"
        >
          {ASSETS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.symbol} — {a.label}
            </option>
          ))}
        </select>
        <OrderTicket assetId={assetId} price={activePrice} cash={cash} onSubmit={submitOrder} />
      </div>
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
