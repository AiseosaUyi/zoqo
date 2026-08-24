"use client";
import * as React from "react";
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { ASSET_BY_ID } from "@/lib/assets";
import { CANDLE_TIMEFRAMES, groupCandles, type Candle } from "@/lib/candles";
import { SegmentedControl, Spinner } from "@/components/ui";

/**
 * The new chart foundation for the terminal — TradingView's own
 * `lightweight-charts` (MIT), replacing the hand-rolled canvas chart the
 * prediction market uses. Takes a pre-aggregated 1-minute base series
 * (TerminalShell owns the incremental bucketing via candles.ts) and groups
 * it client-side into whichever timeframe (M1/M5/M15/M30/H1) is selected.
 *
 * This is the integration point for the drawing-tools plugin
 * (lightweight-charts-drawing — trend lines, Fibonacci, stop-loss pins,
 * notes) called out in TERMINAL_SPEC.md §4, not yet wired here: it's an
 * early-stage library (v0.1.1 at time of writing) with no React wrapper, so
 * it needs its own pass rather than being bolted on under time pressure —
 * see the handoff prompt.
 */
export function TerminalChart({ assetId, candles }: { assetId: string; candles: Candle[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const asset = ASSET_BY_ID[assetId];
  const [timeframe, setTimeframe] = React.useState<string>("1m");

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
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

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
        <div className="text-[12px] font-semibold text-sub">{asset?.symbol ?? assetId}</div>
        <SegmentedControl
          data={CANDLE_TIMEFRAMES.map((tf) => ({ value: tf.key, label: tf.label }))}
          value={timeframe}
          onChange={setTimeframe}
          size="xs"
        />
      </div>
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
  );
}
