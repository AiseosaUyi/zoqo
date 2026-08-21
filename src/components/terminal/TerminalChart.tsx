"use client";
import * as React from "react";
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { ASSET_BY_ID } from "@/lib/assets";

interface Tick {
  t: number;
  p: number;
}

/**
 * The new chart foundation for the terminal — TradingView's own
 * `lightweight-charts` (MIT), replacing the hand-rolled canvas chart the
 * prediction market uses. Buckets the live tick stream into 1-minute
 * candles client-side and renders them as a real candlestick series.
 *
 * This is the integration point for the drawing-tools plugin
 * (lightweight-charts-drawing — trend lines, Fibonacci, stop-loss pins,
 * notes) called out in TERMINAL_SPEC.md §4, not yet wired here: it's an
 * early-stage library (v0.1.1 at time of writing) with no React wrapper, so
 * it needs its own pass rather than being bolted on under time pressure —
 * see the handoff prompt.
 */
export function TerminalChart({ assetId, ticks }: { assetId: string; ticks: Tick[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const asset = ASSET_BY_ID[assetId];

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
  // asset changes, independent of the tick effect below.
  React.useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const decimals = asset?.decimals ?? 2;
    series.applyOptions({
      priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals },
    });
  }, [asset]);

  // Re-bucket to 1m candles whenever the tick stream grows, and push to the
  // series. Cheap enough at this data volume (a few hundred ticks) to just
  // recompute rather than maintain incremental state. When there are no
  // ticks yet (e.g. just switched to an asset with no accumulated buffer),
  // clear the series instead of skipping the update — otherwise the
  // previous asset's candles keep rendering under the new asset's label.
  React.useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (ticks.length === 0) {
      series.setData([]);
      return;
    }
    const candles = bucketToCandles(ticks, 60_000);
    series.setData(candles);
    chartRef.current?.timeScale().fitContent();
  }, [ticks]);

  return (
    <div className="relative h-full w-full">
      <div className="absolute top-2 left-3 z-10 text-[12px] font-semibold text-sub">
        {asset?.symbol ?? assetId}
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

function bucketToCandles(ticks: Tick[], bucketMs: number) {
  const buckets = new Map<number, { o: number; h: number; l: number; c: number }>();
  for (const { t, p } of ticks) {
    const key = Math.floor(t / bucketMs) * bucketMs;
    const b = buckets.get(key);
    if (!b) buckets.set(key, { o: p, h: p, l: p, c: p });
    else {
      b.h = Math.max(b.h, p);
      b.l = Math.min(b.l, p);
      b.c = p;
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, b]) => ({
      time: Math.floor(t / 1000) as UTCTimestamp,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
    }));
}
