"use client";
import * as React from "react";
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { DrawingManager, getToolRegistry } from "lightweight-charts-drawing";
import { ASSET_BY_ID } from "@/lib/assets";
import { CANDLE_TIMEFRAMES, groupCandles, type Candle } from "@/lib/candles";
import { LiveDot, SegmentedControl, Spinner } from "@/components/ui";
import { DrawingToolbar } from "./DrawingToolbar";
import { getDrawings, setDrawings } from "@/lib/drawings";

/**
 * The new chart foundation for the terminal — TradingView's own
 * `lightweight-charts` (MIT), replacing the hand-rolled canvas chart the
 * prediction market uses. Takes a pre-aggregated 1-minute base series
 * (TerminalShell owns the incremental bucketing via candles.ts) and groups
 * it client-side into whichever timeframe (M1/M5/M15/M30/H1) is selected.
 *
 * Drawing tools (TERMINAL_SPEC.md §4) run through `lightweight-charts-drawing`'s
 * `DrawingManager`, which owns click-to-place anchor collection, hit
 * testing, and drag-editing once attached — this component only sets the
 * active tool and persists the manager's own drawing list (see drawings.ts)
 * per asset; it doesn't hand-roll any canvas/mouse handling itself.
 */
export function TerminalChart({
  assetId,
  candles,
  source,
  connected,
}: {
  assetId: string;
  candles: Candle[];
  /** Live-price feed status (from useAssetPrice) — shown next to the
   *  symbol so a degraded connection (WS blocked, silently falling back to
   *  a 4s poll) reads as "Delayed" instead of just looking like a dead
   *  chart. Optional so callers without a feed handle (none today) don't
   *  need to thread it through just to compile. */
  source?: string;
  connected?: boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const drawingManagerRef = React.useRef<DrawingManager | null>(null);
  // Read inside the mount effect's persist() closure (set up once, at
  // manager-creation time) so it always saves against whichever asset is
  // current rather than the asset selected when the effect first ran. Kept
  // in sync via its own effect below (refs can't be written during render).
  const assetIdRef = React.useRef(assetId);
  React.useEffect(() => {
    assetIdRef.current = assetId;
  }, [assetId]);
  const asset = ASSET_BY_ID[assetId];
  const [timeframe, setTimeframe] = React.useState<string>("1m");
  const [activeTool, setActiveTool] = React.useState<string | null>(null);
  const [hasSelection, setHasSelection] = React.useState(false);
  const [hasDrawings, setHasDrawings] = React.useState(false);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#6b6b6b", fontFamily: "Inter, sans-serif" },
      grid: { vertLines: { color: "#eeeeee" }, horzLines: { color: "#eeeeee" } },
      rightPriceScale: { borderColor: "#e5e5e5" },
      timeScale: { borderColor: "#e5e5e5", timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#16a34a",
      wickDownColor: "#ef4444",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const manager = new DrawingManager();
    manager.attach(chart, series, containerRef.current);
    drawingManagerRef.current = manager;

    const persist = () => {
      const exported = manager.exportDrawings();
      setHasDrawings(exported.length > 0);
      // assetIdRef so this closure (set up once, at manager-creation time)
      // always saves against whichever asset is current rather than the
      // asset selected when the effect first ran.
      setDrawings(assetIdRef.current, exported);
    };
    const offAdded = manager.on("drawing:added", persist);
    const offRemoved = manager.on("drawing:removed", persist);
    const offUpdated = manager.on("drawing:updated", persist);
    const offCleared = manager.on("drawing:cleared", persist);
    const offSelected = manager.on("drawing:selected", () => setHasSelection(true));
    const offDeselected = manager.on("drawing:deselected", () => setHasSelection(false));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveTool(null);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      offAdded();
      offRemoved();
      offUpdated();
      offCleared();
      offSelected();
      offDeselected();
      window.removeEventListener("keydown", onKeyDown);
      manager.detach();
      drawingManagerRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Swap the manager's loaded drawings whenever the asset changes — drawings
  // are per-asset (a BTC trend line means nothing on EUR/USD), independent
  // of timeframe (anchors are real time/price, not bar-index, so they still
  // render correctly across M1-H1).
  React.useEffect(() => {
    const manager = drawingManagerRef.current;
    if (!manager) return;
    manager.clearAll();
    const saved = getDrawings(assetId);
    if (saved.length > 0) {
      manager.importDrawings(saved, (type, data) =>
        getToolRegistry().createDrawing(type, data.id, data.anchors, data.style, data.options),
      );
    }
    setHasDrawings(saved.length > 0);
    setHasSelection(false);
  }, [assetId]);

  React.useEffect(() => {
    drawingManagerRef.current?.setActiveTool(activeTool);
  }, [activeTool]);

  const deleteSelected = () => {
    const manager = drawingManagerRef.current;
    const selected = manager?.getSelectedDrawing();
    if (manager && selected) manager.removeDrawing(selected.id);
  };

  const clearAllDrawings = () => {
    drawingManagerRef.current?.clearAll();
    setDrawings(assetId, []);
    setHasDrawings(false);
  };

  // Price-axis precision follows the active asset (assets.ts's `decimals` —
  // BTC/gold are 2dp, most FX 4-5dp, JPY pairs 3dp). Re-applied whenever the
  // asset changes, independent of the candle effect below.
  React.useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const decimals = asset?.decimals ?? 2;
    series.applyOptions({
      priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals },
    });
  }, [asset]);

  const groupMinutes = CANDLE_TIMEFRAMES.find((tf) => tf.key === timeframe)?.minutes ?? 1;
  const displayCandles = React.useMemo(
    () => groupCandles(candles, groupMinutes),
    [candles, groupMinutes],
  );

  // Full setData()+fitContent() only when the asset or timeframe actually
  // changes — that's a genuinely new series. A live tick within the same
  // asset/timeframe instead pushes just the latest bar via series.update(),
  // which lightweight-charts treats as "extend if new time, patch in place
  // if same time as the last point". Calling setData() on every tick (the
  // old behavior) re-fit the view every ~600ms, which fought any zoom/scroll
  // the user did and is part of why the chart felt unusable.
  const resetKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const toPoint = (c: Candle) => ({
      time: Math.floor(c.t / 1000) as UTCTimestamp,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    });
    const key = `${assetId}:${timeframe}`;
    if (resetKeyRef.current !== key) {
      resetKeyRef.current = key;
      series.setData(displayCandles.map(toPoint));
      chartRef.current?.timeScale().fitContent();
      return;
    }
    const last = displayCandles[displayCandles.length - 1];
    if (last) series.update(toPoint(last));
  }, [assetId, timeframe, displayCandles]);

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex items-center gap-2.5">
          <div className="text-[12px] font-semibold text-sub">{asset?.symbol ?? assetId}</div>
          {source != null && connected != null && <LiveDot source={source} connected={connected} />}
        </div>
        <SegmentedControl
          data={CANDLE_TIMEFRAMES.map((tf) => ({ value: tf.key, label: tf.label }))}
          value={timeframe}
          onChange={setTimeframe}
          size="xs"
        />
      </div>
      <div className="relative flex min-h-0 flex-1">
        <DrawingToolbar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          hasSelection={hasSelection}
          onDeleteSelected={deleteSelected}
          hasDrawings={hasDrawings}
          onClearAll={clearAllDrawings}
        />
        <div className="relative min-h-0 flex-1">
          <div ref={containerRef} className="h-full w-full" />
          {candles.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface text-[12px] text-sub">
              <Spinner size="sm" />
              Connecting to a live price…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
