"use client";
import * as React from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type IPaneApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { DrawingManager, getToolRegistry, type Anchor, type IDrawing, type DrawingStyle } from "lightweight-charts-drawing";
import { ASSET_BY_ID } from "@/lib/assets";
import { CANDLE_TIMEFRAMES, groupCandles, type Candle } from "@/lib/candles";
import { LiveDot, SegmentedControl, Spinner } from "@/components/ui";
import { DrawingToolbar } from "./DrawingToolbar";
import { DrawingStylePanel, type StylePanelPosition } from "./DrawingStylePanel";
import { TradingSessionOverlay, type PixelSessionBand } from "./TradingSessionOverlay";
import { IndicatorMenu } from "./IndicatorMenu";
import { getDrawings, setDrawings } from "@/lib/drawings";
import {
  INDICATOR_BY_ID,
  sma,
  ema,
  bollingerBands,
  rsi,
  macd,
  fractal,
  type IndicatorId,
  type IndicatorPoint,
} from "@/lib/indicators";
import { getActiveIndicators, setActiveIndicators } from "@/lib/chartIndicators";
import { getSessionBandsInRange } from "@/lib/tradingSessions";

// Real ZOQO palette hex (tokens.ts) — canvas 2D (what lightweight-charts
// renders through) can't resolve `var(--color-*)` the way SVG/CSS can, so
// these have to be literal values. Kept in one place, not scattered through
// the series-creation calls below.
const OVERLAY_COLOR: Record<string, string> = {
  sma20: "#0047FF", // blue-500
  sma50: "#FF7300", // orange-500
  ema9: "#27AE60", // green-500
  ema30: "#601FFF", // purple-500
  ema50: "#FEAE14", // gold-500
  ema100: "#FF2E00", // red-500
  ema200: "#5C584F", // gray-600
};
const FRACTAL_HIGH_COLOR = "#FF2E00"; // red-500
const FRACTAL_LOW_COLOR = "#27AE60"; // green-500
const BB_BAND_COLOR = "#B0ABA1"; // gray-400
const BB_BASIS_COLOR = "#601FFF"; // purple-500
const RSI_COLOR = "#601FFF"; // purple-500
const RSI_BAND_COLOR = "#B0ABA1"; // gray-400
const MACD_LINE_COLOR = "#0047FF"; // blue-500
const MACD_SIGNAL_COLOR = "#FF7300"; // orange-500
const MACD_HIST_UP = "#27AE60"; // green-500
const MACD_HIST_DOWN = "#FF2E00"; // red-500

const toLinePoint = (p: IndicatorPoint) => ({ time: p.time as UTCTimestamp, value: p.value });

/** Imperative handle so the panel system's toolbar (PanelFrame's Refresh/
 *  Screenshot buttons) can drive the chart without threading its state up —
 *  both delegate straight to lightweight-charts' own native APIs, no
 *  reimplementation. */
export interface TerminalChartHandle {
  fitContent: () => void;
  /** Returns the chart's rendered canvas (lightweight-charts' own
   *  `takeScreenshot()`), or null if the chart hasn't mounted yet. */
  screenshot: () => HTMLCanvasElement | null;
}

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
export const TerminalChart = React.forwardRef<
  TerminalChartHandle,
  {
    assetId: string;
    candles: Candle[];
    /** Live-price feed status (from useAssetPrice) — shown next to the
     *  symbol so a degraded connection (WS blocked, silently falling back to
     *  a 4s poll) reads as "Delayed" instead of just looking like a dead
     *  chart. Optional so callers without a feed handle (none today) don't
     *  need to thread it through just to compile. */
    source?: string;
    connected?: boolean;
  }
>(function TerminalChart({ assetId, candles, source, connected }, ref) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const drawingManagerRef = React.useRef<DrawingManager | null>(null);
  const rsiPaneRef = React.useRef<IPaneApi<Time> | null>(null);
  const macdPaneRef = React.useRef<IPaneApi<Time> | null>(null);
  const indicatorSeriesRef = React.useRef<Map<IndicatorId, ISeriesApi<"Line" | "Histogram">[]>>(new Map());
  // Fractal renders as sparse point markers on the candlestick series itself
  // (createSeriesMarkers plugin), not a Line/Histogram series — tracked
  // separately since it doesn't fit indicatorSeriesRef's shape.
  const fractalMarkersRef = React.useRef<ISeriesMarkersPluginApi<Time> | null>(null);
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
  // Read inside the placement click subscriber below (set up once, at mount)
  // so it always sees the current tool rather than the tool active when the
  // effect first ran — same assetIdRef pattern as above.
  const activeToolRef = React.useRef<string | null>(null);
  const pendingAnchorsRef = React.useRef<Anchor[]>([]);
  const [hasSelection, setHasSelection] = React.useState(false);
  const [selectedDrawing, setSelectedDrawing] = React.useState<IDrawing | null>(null);
  // Bumped on pan/zoom/resize/style-edit so the style panel's position and
  // displayed style recompute without needing selectedDrawing itself (a
  // mutable object the drawing library updates in place) to change identity.
  const [panelVersion, setPanelVersion] = React.useState(0);
  const [hasDrawings, setHasDrawings] = React.useState(false);
  // Loaded from localStorage inside the mount effect below (client-only —
  // same reasoning as getDrawings never being called from a useState
  // initializer, which would run during SSR where localStorage doesn't exist).
  const [activeIndicators, setActiveIndicatorsState] = React.useState<IndicatorId[]>([]);
  const toggleIndicator = (id: IndicatorId) => {
    setActiveIndicatorsState((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setActiveIndicators(next);
      return next;
    });
  };

  React.useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#6b6b6b", fontFamily: "Inter, sans-serif" },
      grid: { vertLines: { color: "#eeeeee" }, horzLines: { color: "#eeeeee" } },
      rightPriceScale: { borderColor: "#e5e5e5" },
      timeScale: { borderColor: "#e5e5e5", timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
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

    setActiveIndicatorsState(getActiveIndicators());

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
    const offSelected = manager.on("drawing:selected", (event) => {
      setHasSelection(true);
      setSelectedDrawing(event.drawing ?? manager.getSelectedDrawing());
    });
    const offDeselected = manager.on("drawing:deselected", () => {
      setHasSelection(false);
      setSelectedDrawing(null);
    });
    // Style panel is anchored to the shape's pixel position, which shifts on
    // every pan/zoom — this is the one thing that changes it without a
    // selection or style change of its own.
    const onRangeChange = () => setPanelVersion((v) => v + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveTool(null);
    };
    window.addEventListener("keydown", onKeyDown);

    // The plugin's DrawingManager tracks setActiveTool()/getActiveTool() and
    // exposes addDrawing()/getToolRegistry().createDrawing(), but never
    // actually wires a click → collect anchors → build-and-add-drawing loop
    // itself (confirmed by reading its bundled source: handleClick() only
    // does hit-test/select, and only when NO tool is active). That loop has
    // to live in the host app — this is it. One subscriber, tool-agnostic:
    // it asks the registry how many anchors the active tool needs and fires
    // once enough clicks have landed.
    const onPlacementClick = (param: MouseEventParams) => {
      const tool = activeToolRef.current;
      const point = param.point;
      if (!tool || !point) return;
      const time = chart.timeScale().coordinateToTime(point.x);
      const price = series.coordinateToPrice(point.y);
      if (time == null || price == null) return;
      pendingAnchorsRef.current.push({ time, price });
      const required = getToolRegistry().get(tool)?.requiredAnchors ?? 1;
      if (pendingAnchorsRef.current.length < required) return;
      const drawing = getToolRegistry().createDrawing(tool, crypto.randomUUID(), pendingAnchorsRef.current);
      pendingAnchorsRef.current = [];
      if (drawing) manager.addDrawing(drawing);
      setActiveTool(null);
    };
    chart.subscribeClick(onPlacementClick);

    // Explicit ResizeObserver instead of `autoSize: true` — the panel system
    // (react-resizable-panels) resizes this container via flex-basis %
    // changes on drag/collapse/hide, and lightweight-charts' own autoSize
    // observer has missed those transitions in practice (chart keeps its
    // stale width, so the right price scale renders off the visible edge
    // until something else forces a reflow). Driving `chart.resize()`
    // ourselves off the same container guarantees it tracks every layout
    // change, not just ones autoSize happens to catch.
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        chart.resize(width, height);
        setChartHeight(height);
        setPanelVersion((v) => v + 1);
      }
    });
    ro.observe(containerRef.current);
    setChartHeight(containerRef.current.clientHeight);

    return () => {
      ro.disconnect();
      chart.unsubscribeClick(onPlacementClick);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
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
      rsiPaneRef.current = null;
      macdPaneRef.current = null;
      indicatorSeriesRef.current = new Map();
      fractalMarkersRef.current = null;
    };
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      fitContent: () => chartRef.current?.timeScale().fitContent(),
      screenshot: () => chartRef.current?.takeScreenshot() ?? null,
    }),
    [],
  );

  // Swap the manager's loaded drawings whenever the asset changes — drawings
  // are per-asset (a BTC trend line means nothing on EUR/USD), independent
  // of timeframe (anchors are real time/price, not bar-index, so they still
  // render correctly across M1-H1).
  //
  // clearAll() is skipped when the manager is already empty (true on first
  // mount, before anything has ever been loaded) because the plugin's
  // clearAll() unconditionally emits "drawing:cleared" even with nothing to
  // clear — persist() (below) reacts to that by writing an empty array to
  // localStorage for the current asset, which raced ahead of the
  // getDrawings() read two lines down and silently erased every saved
  // drawing on every single reload. Confirmed by reproducing it: place a
  // drawing, reload, watch `zoqo-drawings-v1` come back `{}`.
  React.useEffect(() => {
    const manager = drawingManagerRef.current;
    if (!manager) return;
    if (manager.getAllDrawings().length > 0) manager.clearAll();
    const saved = getDrawings(assetId);
    if (saved.length > 0) {
      manager.importDrawings(saved, (type, data) =>
        getToolRegistry().createDrawing(type, data.id, data.anchors, data.style, data.options),
      );
    }
    setHasDrawings(saved.length > 0);
    setHasSelection(false);
    setSelectedDrawing(null);
  }, [assetId]);

  React.useEffect(() => {
    activeToolRef.current = activeTool;
    pendingAnchorsRef.current = [];
    drawingManagerRef.current?.setActiveTool(activeTool);
  }, [activeTool]);

  const deleteSelected = () => {
    const manager = drawingManagerRef.current;
    const selected = manager?.getSelectedDrawing();
    if (manager && selected) manager.removeDrawing(selected.id);
    setHasSelection(false);
    setSelectedDrawing(null);
  };

  const clearAllDrawings = () => {
    drawingManagerRef.current?.clearAll();
    setDrawings(assetId, []);
    setHasDrawings(false);
  };

  const closeStylePanel = () => {
    drawingManagerRef.current?.deselectAll();
    setHasSelection(false);
    setSelectedDrawing(null);
  };

  // Bypasses the DrawingManager (updateStyle is a Drawing-instance method,
  // not something the manager exposes a pass-through for) so the manager's
  // own "drawing:updated" event never fires here — persistence is done
  // manually, matching what the mount effect's persist() closure does for
  // every other mutation path.
  const handleStyleChange = (patch: Partial<DrawingStyle>) => {
    const manager = drawingManagerRef.current;
    if (!manager || !selectedDrawing) return;
    selectedDrawing.updateStyle(patch);
    setPanelVersion((v) => v + 1);
    const exported = manager.exportDrawings();
    setDrawings(assetId, exported);
  };

  // First anchor's pixel position, recomputed whenever panelVersion bumps
  // (pan/zoom/resize/style-edit) or the selection itself changes.
  const stylePanelPosition = React.useMemo<StylePanelPosition | null>(() => {
    void panelVersion; // recompute trigger only, value itself unused
    const chart = chartRef.current;
    const series = seriesRef.current;
    const container = containerRef.current;
    if (!chart || !series || !container || !selectedDrawing) return null;
    const anchor = selectedDrawing.anchors[0];
    if (!anchor) return null;
    const x = chart.timeScale().timeToCoordinate(anchor.time as Time);
    const y = series.priceToCoordinate(anchor.price);
    if (x == null || y == null) return null;
    return { x, y, containerWidth: container.clientWidth, containerHeight: container.clientHeight };
  }, [selectedDrawing, panelVersion]);
  const [chartHeight, setChartHeight] = React.useState(0);

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

  // Session overlay: forex/gold only (crypto has no session concept — see
  // tradingSessions.ts), recomputed on the same pan/zoom/resize trigger the
  // style panel uses. timeToCoordinate can return null for a time outside
  // the chart's actual plotted bar range (common with a short, few-hours-old
  // history against multi-hour session bands) — rather than skip those
  // bands (which flickered the whole overlay on/off as the live tick moved
  // the data boundary across a band edge every render), clamp to the
  // container's screen edge instead: a band edge outside the plotted range
  // is, by definition, off-screen in that direction, so 0/width is the
  // correct pixel value, not an absent one.
  const sessionBands = React.useMemo<PixelSessionBand[]>(() => {
    void panelVersion;
    if (!asset || asset.assetClass === "crypto" || displayCandles.length === 0) return [];
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return [];
    const dataFromSec = Math.floor(displayCandles[0].t / 1000);
    const dataToSec = Math.floor(displayCandles[displayCandles.length - 1].t / 1000);
    const containerWidth = container.clientWidth;
    const bands = getSessionBandsInRange(dataFromSec, dataToSec);
    const pixelBands: PixelSessionBand[] = [];
    for (const b of bands) {
      const rawLeft = chart.timeScale().timeToCoordinate(b.startSec as Time);
      const rawRight = chart.timeScale().timeToCoordinate(b.endSec as Time);
      const left = rawLeft ?? (b.startSec < dataFromSec ? 0 : containerWidth);
      const right = rawRight ?? (b.endSec > dataToSec ? containerWidth : 0);
      pixelBands.push({ key: b.key, label: b.label, color: b.color, left, right });
    }
    return pixelBands;
  }, [asset, panelVersion, displayCandles]);

  // Indicator lifecycle + live recompute. RSI and MACD each get their own
  // pane, created on demand (chart.addPane()) the first time that indicator
  // is turned on and removed (chart.removePane()) when it's turned off —
  // always looked up via the live IPaneApi object's own .paneIndex(), never
  // a cached number, so it stays correct even if the other oscillator pane
  // is added/removed around it. Runs on every candle tick too (not just
  // indicator toggles) so lines actually move with price — the add/remove
  // loops are no-ops when the active set hasn't changed, only the final
  // setData() pass does real work on a plain tick.
  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const map = indicatorSeriesRef.current;

    for (const [id, seriesList] of Array.from(map.entries())) {
      if (activeIndicators.includes(id)) continue;
      for (const s of seriesList) chart.removeSeries(s);
      map.delete(id);
      if (id === "rsi14" && rsiPaneRef.current) {
        chart.removePane(rsiPaneRef.current.paneIndex());
        rsiPaneRef.current = null;
      }
      if (id === "macd" && macdPaneRef.current) {
        chart.removePane(macdPaneRef.current.paneIndex());
        macdPaneRef.current = null;
      }
      if (id === "fractal" && fractalMarkersRef.current) {
        fractalMarkersRef.current.detach();
        fractalMarkersRef.current = null;
      }
    }

    for (const id of activeIndicators) {
      if (map.has(id)) continue;
      if (id === "bb20") {
        const upper = chart.addSeries(LineSeries, {
          color: BB_BAND_COLOR,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
          title: "BB upper",
        });
        const middle = chart.addSeries(LineSeries, {
          color: BB_BASIS_COLOR,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          title: "BB basis",
        });
        const lower = chart.addSeries(LineSeries, {
          color: BB_BAND_COLOR,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
          title: "BB lower",
        });
        map.set(id, [upper, middle, lower]);
      } else if (id === "rsi14") {
        const pane = rsiPaneRef.current ?? (rsiPaneRef.current = chart.addPane(true));
        const line = chart.addSeries(
          LineSeries,
          { color: RSI_COLOR, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "RSI 14" },
          pane.paneIndex(),
        );
        line.createPriceLine({ price: 70, color: RSI_BAND_COLOR, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "70" });
        line.createPriceLine({ price: 30, color: RSI_BAND_COLOR, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30" });
        map.set(id, [line]);
      } else if (id === "macd") {
        const pane = macdPaneRef.current ?? (macdPaneRef.current = chart.addPane(true));
        const paneIndex = pane.paneIndex();
        const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, title: "MACD hist" }, paneIndex);
        const macdLine = chart.addSeries(
          LineSeries,
          { color: MACD_LINE_COLOR, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: "MACD" },
          paneIndex,
        );
        const signalLine = chart.addSeries(
          LineSeries,
          { color: MACD_SIGNAL_COLOR, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: "Signal" },
          paneIndex,
        );
        map.set(id, [hist, macdLine, signalLine]);
      } else if (id === "fractal") {
        if (seriesRef.current) fractalMarkersRef.current = createSeriesMarkers(seriesRef.current, []);
        map.set(id, []);
      } else {
        const line = chart.addSeries(LineSeries, {
          color: OVERLAY_COLOR[id],
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: INDICATOR_BY_ID[id].label,
        });
        map.set(id, [line]);
      }
    }

    for (const id of activeIndicators) {
      if (id === "fractal") {
        if (!fractalMarkersRef.current) continue;
        const points = fractal(displayCandles);
        const markers: SeriesMarker<Time>[] = points.map((p) => ({
          time: p.time as UTCTimestamp,
          position: p.type === "high" ? "aboveBar" : "belowBar",
          color: p.type === "high" ? FRACTAL_HIGH_COLOR : FRACTAL_LOW_COLOR,
          shape: p.type === "high" ? "arrowDown" : "arrowUp",
        }));
        fractalMarkersRef.current.setMarkers(markers);
        continue;
      }
      const seriesList = map.get(id);
      if (!seriesList) continue;
      if (id === "sma20") seriesList[0].setData(sma(displayCandles, 20).map(toLinePoint));
      else if (id === "sma50") seriesList[0].setData(sma(displayCandles, 50).map(toLinePoint));
      else if (id === "ema9") seriesList[0].setData(ema(displayCandles, 9).map(toLinePoint));
      else if (id === "ema30") seriesList[0].setData(ema(displayCandles, 30).map(toLinePoint));
      else if (id === "ema50") seriesList[0].setData(ema(displayCandles, 50).map(toLinePoint));
      else if (id === "ema100") seriesList[0].setData(ema(displayCandles, 100).map(toLinePoint));
      else if (id === "ema200") seriesList[0].setData(ema(displayCandles, 200).map(toLinePoint));
      else if (id === "bb20") {
        const bands = bollingerBands(displayCandles, 20, 2);
        seriesList[0].setData(bands.map((b) => ({ time: b.time as UTCTimestamp, value: b.upper })));
        seriesList[1].setData(bands.map((b) => ({ time: b.time as UTCTimestamp, value: b.middle })));
        seriesList[2].setData(bands.map((b) => ({ time: b.time as UTCTimestamp, value: b.lower })));
      } else if (id === "rsi14") {
        seriesList[0].setData(rsi(displayCandles, 14).map(toLinePoint));
      } else if (id === "macd") {
        const points = macd(displayCandles, 12, 26, 9);
        seriesList[0].setData(
          points.map((p) => ({ time: p.time as UTCTimestamp, value: p.hist, color: p.hist >= 0 ? MACD_HIST_UP : MACD_HIST_DOWN })),
        );
        seriesList[1].setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })));
        seriesList[2].setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })));
      }
    }
  }, [activeIndicators, displayCandles]);

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
        <div className="flex min-w-0 items-center gap-2">
          <IndicatorMenu active={activeIndicators} onToggle={toggleIndicator} />
          {/* 9 timeframes (was 5) won't always fit the panel width — scrolls
           *  horizontally instead of SegmentedControl's own overflow-hidden
           *  silently clipping tabs, same fix pattern as the prior terminal
           *  toolbar overflow bug. */}
          <div className="overflow-x-auto scroll-thin">
            <SegmentedControl
              data={CANDLE_TIMEFRAMES.map((tf) => ({ value: tf.key, label: tf.label }))}
              value={timeframe}
              onChange={setTimeframe}
              size="xs"
            />
          </div>
        </div>
      </div>
      {activeIndicators.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1.5 pt-1">
          {activeIndicators.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleIndicator(id)}
              className="inline-flex items-center gap-1 rounded-chip bg-gray-50 px-2 py-0.5 text-[10.5px] font-semibold text-sub transition-colors hover:bg-gray-100 hover:text-ink"
              title="Remove"
            >
              {INDICATOR_BY_ID[id].label}
              <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <DrawingToolbar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          hasSelection={hasSelection}
          onDeleteSelected={deleteSelected}
          hasDrawings={hasDrawings}
          onClearAll={clearAllDrawings}
        />
        <div className="relative min-h-0 flex-1">
          <TradingSessionOverlay bands={sessionBands} height={chartHeight} />
          <div ref={containerRef} className="h-full w-full" />
          {selectedDrawing && stylePanelPosition && (
            <DrawingStylePanel
              style={selectedDrawing.style}
              position={stylePanelPosition}
              onChange={handleStyleChange}
              onDelete={deleteSelected}
              onClose={closeStylePanel}
            />
          )}
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
});
