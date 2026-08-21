"use client";
import * as React from "react";
import { createChart, CandlestickSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

/** A small, paused candlestick chart for one Academy quiz question — same
 *  `lightweight-charts` foundation and visual language as the terminal's
 *  `TerminalChart`, but fed a fixed hand-authored pattern instead of a live
 *  tick stream. Replaces the old `chartDesc` text stub ("Chart preview
 *  coming soon") with a real rendered chart. The time axis is illustrative
 *  only (sequential candles, not real timestamps), so it's hidden — a quiz
 *  pattern isn't tied to a real point in history. */
export function PatternChart({ candles }: { candles: Candle[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#6b6b6b", fontFamily: "Inter, sans-serif" },
      grid: { vertLines: { visible: false }, horzLines: { color: "#eeeeee" } },
      rightPriceScale: { borderColor: "#e5e5e5" },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
      autoSize: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#16a34a",
      wickDownColor: "#ef4444",
    });
    series.setData(
      candles.map((c, i) => ({
        time: (i * 60) as UTCTimestamp, // sequential, not real time — axis is hidden
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    chart.timeScale().fitContent();
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
    // candles are static per question; re-create only if the array identity changes
  }, [candles]);

  return <div ref={containerRef} className="h-[140px] w-full" />;
}
