"use client";
import * as React from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  type AutoscaleInfo,
} from "lightweight-charts";

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartPriceLine {
  price: number;
  color: string;
  title: string;
}

/** A small, paused candlestick chart for one Academy quiz question — same
 *  `lightweight-charts` foundation and visual language as the terminal's
 *  `TerminalChart`, but fed a fixed hand-authored pattern instead of a live
 *  tick stream. Replaces the old `chartDesc` text stub ("Chart preview
 *  coming soon") with a real rendered chart. The time axis is illustrative
 *  only (sequential candles, not real timestamps), so it's hidden — a quiz
 *  pattern isn't tied to a real point in history. Sized by its parent
 *  (`h-full w-full`) rather than a fixed height, so both Signal Spot's small
 *  quiz box and Build the Order's taller setup view can reuse it.
 *
 *  `priceLines` is additive, used by "Build the Order" to draw the user's
 *  current entry/stop-loss/take-profit slider values over the setup —
 *  recreated (not incrementally updated) whenever they change, since a
 *  handful of price lines redrawn on every slider drag is cheap. */
export function PatternChart({ candles, priceLines }: { candles: Candle[]; priceLines?: ChartPriceLine[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLineRefs = React.useRef<IPriceLine[]>([]);

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
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRefs.current = [];
    };
    // candles are static per question; re-create only if the array identity changes
  }, [candles]);

  React.useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of priceLineRefs.current) series.removePriceLine(line);
    priceLineRefs.current = (priceLines ?? []).map((pl) =>
      series.createPriceLine({
        price: pl.price,
        color: pl.color,
        lineWidth: 2,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: pl.title,
      }),
    );
    // `autoScale` alone doesn't help here — per lightweight-charts' own docs,
    // autoscale is computed from the visible *data* range only; price lines
    // are annotations, not data, so a line like Build the Order's
    // take-profit (which can sit well above every candle's high) silently
    // renders off the top of the chart otherwise. `autoscaleInfoProvider` is
    // the documented way to fold extra values into that computation.
    series.applyOptions({
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const res = original();
        if (!res || !res.priceRange || !priceLines || priceLines.length === 0) return res;
        const values = priceLines.map((pl) => pl.price);
        return {
          ...res,
          priceRange: {
            minValue: Math.min(res.priceRange.minValue, ...values),
            maxValue: Math.max(res.priceRange.maxValue, ...values),
          },
        };
      },
    });
  }, [priceLines]);

  return <div ref={containerRef} className="h-full w-full" />;
}
