"use client";
import * as React from "react";
import { useZoqo } from "@/lib/store";
import { TerminalProvider, useTerminal } from "@/lib/terminalStore";
import { useAssetPrice } from "@/lib/useAssetPrice";
import { useTicker } from "@/lib/useTicker";
import { ASSETS, DEFAULT_ASSET_ID } from "@/lib/assets";
import { Watchlist } from "./Watchlist";
import { OrderTicket } from "./OrderTicket";
import { PositionsPanel } from "./PositionsPanel";
import { TerminalChart } from "./TerminalChart";
import { usd, signedUsd } from "@/lib/format";

// A time-window cap, not a tick-count cap. TerminalChart buckets ticks into
// 60s candles (bucketToCandles); a count cap like the old MAX_TICKS=500 caps
// the buffer's real time span at just seconds for a fast-trading asset like
// BTC (multiple ticks/sec), collapsing everything into a single degenerate
// candle that fitContent() then stretches to fill the whole panel — the
// "solid block" bug. Keeping a 60-minute window instead guarantees up to ~60
// real 1-minute candles regardless of an asset's trade frequency, so slow
// tickers (forex/gold) still get a populated chart and fast tickers (BTC)
// don't degenerate to one bucket. Only the currently-selected asset accrues
// ticks (see the price-change check below), so this doesn't grow unbounded
// across the whole watchlist — worst case is one asset's buffer at BTC's
// tick rate over an hour, which is small.
const TICK_WINDOW_MS = 60 * 60 * 1000;

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
  const { cash } = useZoqo();
  const { openPosition, markToMarket } = useTerminal();
  const [assetId, setAssetId] = React.useState(DEFAULT_ASSET_ID);
  const [ticksByAsset, setTicksByAsset] = React.useState<Record<string, { t: number; p: number }[]>>({});

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
    setTicksByAsset((prev) => {
      const cutoff = nowMs - TICK_WINDOW_MS;
      const arr = [...(prev[assetId] ?? []), { t: nowMs, p: activePrice }].filter((tk) => tk.t >= cutoff);
      return { ...prev, [assetId]: arr };
    });
  }

  const priceMap: Record<string, number | null> = {};
  for (const a of ASSETS) priceMap[a.id] = prices[a.id]?.price ?? null;
  const priceMapForMtm: Record<string, number> = {};
  for (const k in priceMap) if (priceMap[k]) priceMapForMtm[k] = priceMap[k]!;
  const { unrealizedPnl, equity } = markToMarket(priceMapForMtm);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
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
            <TerminalChart assetId={assetId} ticks={ticksByAsset[assetId] ?? []} />
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
            onSubmit={(side, qty, sl, tp) =>
              activePrice ? openPosition(assetId, side, qty, activePrice, { stopLoss: sl, takeProfit: tp }) : false
            }
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
        <OrderTicket
          assetId={assetId}
          price={activePrice}
          cash={cash}
          onSubmit={(side, qty, sl, tp) =>
            activePrice ? openPosition(assetId, side, qty, activePrice, { stopLoss: sl, takeProfit: tp }) : false
          }
        />
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
