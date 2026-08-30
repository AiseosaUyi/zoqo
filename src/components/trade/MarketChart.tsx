"use client";
import * as React from "react";
import type { Market } from "@/lib/types";
import type { PricePoint } from "@/lib/store";
import { btc } from "@/lib/format";
import { clamp } from "@/lib/math";
import { useMeasure } from "./useMeasure";

const WINDOW = 5 * 60_000;

export interface MarketChartProps {
  priceSeries: PricePoint[];
  markets: Market[];
  liveMarketId?: string;
  focusMarketId?: string; // single mode: the market we're trading
  mode: "multi" | "single";
  showColumns: boolean;
  rangeMs?: number; // when set, the price x-domain is the last `rangeMs` of data
  viewStart?: number; // forced x-domain start (multi timeline — aligns with header)
  viewEnd?: number; // forced x-domain end
  now?: number; // engine clock, for the "now" marker + future zone
  onColumnActivate?: (marketId: string) => void;
  height?: number;
}

export function MarketChart(props: MarketChartProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const height = props.height ?? 460;
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && <ChartSVG {...props} width={width} height={height} />}
    </div>
  );
}

function ChartSVG({
  priceSeries,
  markets,
  liveMarketId,
  focusMarketId,
  mode,
  showColumns,
  rangeMs,
  viewStart,
  viewEnd,
  now,
  onColumnActivate,
  width,
  height,
}: MarketChartProps & { width: number; height: number }) {
  const focus = markets.find((m) => m.id === focusMarketId);

  // ---- layout ----
  const padL = 8;
  const padR = 64;
  const padT = 14;
  const bottomAxisH = 18;
  const priceH = Math.max(110, height - padT - bottomAxisH);
  const priceTop = padT;
  const priceBot = padT + priceH;

  const plotL = padL;
  const plotR = width - padR;
  const plotW = Math.max(1, plotR - plotL);

  // ---- x domain ----
  let t0: number;
  let t1: number;
  const lastSeriesT = priceSeries.at(-1)?.t;
  if (viewStart != null && viewEnd != null) {
    // multi timeline: domain forced by the page so bands == market columns
    t0 = viewStart;
    t1 = viewEnd;
  } else if (rangeMs) {
    // timeframe-driven: show the last `rangeMs` of price, ending at the latest data
    t1 = lastSeriesT ?? markets.at(-1)?.closeTime ?? 1;
    t0 = t1 - rangeMs;
  } else if (mode === "single" && focus) {
    t0 = focus.openTime - WINDOW; // one window of lead-in + the market window
    t1 = focus.closeTime;
  } else if (markets.length) {
    t0 = markets[0].openTime;
    t1 = markets[markets.length - 1].closeTime;
  } else {
    t0 = priceSeries[0]?.t ?? 0;
    t1 = priceSeries.at(-1)?.t ?? 1;
  }
  const x = (t: number) => plotL + ((t - t0) / (t1 - t0)) * plotW;

  // ---- price y domain ----
  const visible = priceSeries.filter((p) => p.t >= t0 - WINDOW && p.t <= t1);
  const pts = visible.length ? visible : priceSeries.slice(-2);
  let pMin = Infinity;
  let pMax = -Infinity;
  for (const p of pts) {
    if (p.p < pMin) pMin = p.p;
    if (p.p > pMax) pMax = p.p;
  }
  const strike = focus?.strike ?? markets.find((m) => m.id === liveMarketId)?.strike;
  if (strike) {
    pMin = Math.min(pMin, strike);
    pMax = Math.max(pMax, strike);
  }
  if (!isFinite(pMin)) {
    pMin = 0;
    pMax = 1;
  }
  const pPad = (pMax - pMin) * 0.12 || pMax * 0.001 || 1;
  pMin -= pPad;
  pMax += pPad;
  const py = (p: number) => priceBot - ((p - pMin) / (pMax - pMin)) * priceH;

  // ---- price path ----
  const linePts = pts.map((p) => `${x(p.t).toFixed(1)},${py(p.p).toFixed(1)}`);
  const linePath = linePts.length ? `M${linePts.join(" L")}` : "";
  const lastP = pts.at(-1);

  // ---- price axis ticks ----
  const priceTicks = niceTicks(pMin + pPad, pMax - pPad, 4);
  // ---- time axis ticks ----
  const span = Math.max(1, t1 - t0);
  const aligned = viewStart != null && viewEnd != null;
  // is "now" inside the viewed window? (false when panned into the past)
  const nowInView = now != null && now >= t0 && now <= t1;
  const showNow = !aligned || nowInView;
  let timeTicks: number[];
  if (aligned && markets.length) {
    // one label per market boundary so the axis reads as 5-min blocks
    const bounds = new Set<number>();
    for (const m of markets) {
      if (m.openTime >= t0 - 1 && m.openTime <= t1 + 1) bounds.add(m.openTime);
      if (m.closeTime >= t0 - 1 && m.closeTime <= t1 + 1) bounds.add(m.closeTime);
    }
    timeTicks = [...bounds].sort((a, b) => a - b);
  } else {
    const tickStep = pickTimeStep(span);
    timeTicks = [];
    for (let t = Math.ceil(t0 / tickStep) * tickStep; t <= t1; t += tickStep) timeTicks.push(t);
  }

  const gridId = React.useId();

  return (
    <svg width={width} height={height} className="block select-none">
      <defs>
        {/* diagonal hatch — marks the unresolved future (no price yet) */}
        <pattern id={`hatch-${gridId}`} width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="7" height="7" fill="var(--color-purple-50)" opacity={0.55} />
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-purple-200)" strokeWidth="1.1" opacity={0.5} />
        </pattern>
        {/* clip everything time-domain to the plot — nothing bleeds into the
            right price-axis gutter (the "broken future" the bands used to create). */}
        <clipPath id={`plot-${gridId}`}>
          <rect
            x={plotL}
            y={priceTop}
            width={plotW}
            height={priceBot - priceTop}
          />
        </clipPath>
      </defs>

      {/* market column bands — clipped so the live band stops cleanly at "now" */}
      {showColumns && (
      <g clipPath={`url(#plot-${gridId})`}>
        {markets.map((m) => {
          const bx = x(m.openTime);
          const bw = x(m.closeTime) - bx;
          const isLive = m.id === liveMarketId;
          const isFocus = m.id === focusMarketId;
          return (
            <g key={m.id}>
              <rect
                x={bx}
                y={priceTop}
                width={bw}
                height={priceBot - priceTop}
                fill={isLive ? "var(--color-purple-50)" : isFocus ? "var(--color-purple-50)" : "transparent"}
                opacity={isLive ? 0.7 : 0.4}
                className={onColumnActivate ? "cursor-pointer" : undefined}
                onDoubleClick={() => onColumnActivate?.(m.id)}
              >
                {onColumnActivate && <title>Double-click to open {m.label} market</title>}
              </rect>
              <line
                x1={bx}
                y1={priceTop}
                x2={bx}
                y2={priceBot}
                stroke="var(--color-line)"
                strokeWidth={1}
              />
            </g>
          );
        })}
      </g>
      )}

      {/* future zone — everything right of "now" is unknowable; hatch it so the
          empty space reads as intentional, not a broken/detached chart */}
      {aligned && now != null && (() => {
        const nowX = clamp(x(now), plotL, plotR);
        if (nowX >= plotR - 0.5) return null;
        const midX = clamp((nowX + plotR) / 2, plotL, plotR);
        return (
          <g>
            <rect x={nowX} y={priceTop} width={plotR - nowX} height={priceBot - priceTop} fill={`url(#hatch-${gridId})`} />
            <line x1={nowX} y1={priceTop} x2={nowX} y2={priceBot} stroke="var(--color-purple-400)" strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />
            <text x={midX} y={priceTop + 14} fontSize={10} fontWeight={700} textAnchor="middle" fill="var(--color-purple-400)" letterSpacing="0.04em">
              NOT YET TRADED
            </text>
          </g>
        );
      })()}

      {/* horizontal price gridlines + right axis */}
      {priceTicks.map((t) => (
        <g key={`pt${t}`}>
          <line
            x1={plotL}
            y1={py(t)}
            x2={plotR}
            y2={py(t)}
            stroke="var(--color-line)"
            strokeDasharray="0"
            strokeWidth={1}
          />
          <text
            x={plotR + 8}
            y={py(t) + 4}
            fontSize={11}
            className="nums"
            fill="var(--color-sub)"
          >
            {btc(t)}
          </text>
        </g>
      ))}

      {/* target (strike) line */}
      {strike && (
        <g>
          <line
            x1={plotL}
            y1={py(strike)}
            x2={plotR}
            y2={py(strike)}
            stroke="var(--color-yellow-500)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
          <rect x={plotL} y={py(strike) - 9} width={92} height={16} rx={4} fill="var(--color-yellow-500)" opacity={0.16} />
          <text x={plotL + 6} y={py(strike) + 3} fontSize={10.5} fontWeight={700} fill="#8a6d00">
            Target {btc(strike)}
          </text>
        </g>
      )}

      {/* price line (no fill — just the moving line) */}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-purple-500)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* current price marker + tag — only when "now" is actually in view */}
      {lastP && showNow && (
        <g>
          <line
            x1={plotL}
            y1={py(lastP.p)}
            x2={x(lastP.t)}
            y2={py(lastP.p)}
            stroke="var(--color-purple-400)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />
          {/* "now" leading edge — breathing dot + ring, pulsing to the right */}
          <circle cx={x(lastP.t)} cy={py(lastP.p)} r={4} fill="var(--color-purple-500)" className="now-ring" />
          <circle cx={x(lastP.t)} cy={py(lastP.p)} r={3.5} fill="var(--color-purple-500)" className="now-dot" />
          {(() => {
            // tag at the right axis normally; pinned to the now-dot in the
            // aligned timeline so it never floats across the future hatch.
            const tagX = aligned ? clamp(x(lastP.t) + 6, plotL, plotR - 58) : plotR + 2;
            return (
              <>
                <rect x={tagX} y={py(lastP.p) - 9} width={58} height={18} rx={4} fill="var(--color-purple-500)" />
                <text x={tagX + 29} y={py(lastP.p) + 3.5} fontSize={11} fontWeight={700} textAnchor="middle" fill="#fff" className="nums">
                  {btc(lastP.p)}
                </text>
              </>
            );
          })()}
        </g>
      )}

      {/* price time axis (BTC timeframe) — sits directly under the price chart */}
      {timeTicks.map((t) => (
        <text
          key={`tt${t}`}
          x={x(t)}
          y={priceBot + 14}
          fontSize={10.5}
          textAnchor="middle"
          className="nums"
          fill="var(--color-sub)"
        >
          {fmtTick(t, span)}
        </text>
      ))}
    </svg>
  );
}

const TIME_STEPS = [
  5_000, 10_000, 15_000, 30_000, 60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000,
  15 * 60_000, 30 * 60_000, 3_600_000, 2 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000,
  86_400_000, 2 * 86_400_000, 7 * 86_400_000, 14 * 86_400_000, 30 * 86_400_000,
  90 * 86_400_000,
];
/** Pick a "nice" time-axis step so the visible span shows ~5–7 labels. */
function pickTimeStep(span: number): number {
  const target = span / 6;
  for (const s of TIME_STEPS) if (s >= target) return s;
  return TIME_STEPS[TIME_STEPS.length - 1];
}
/** Format a tick adaptively: seconds when zoomed in, dates when zoomed out. */
function fmtTick(t: number, span: number): string {
  const d = new Date(t);
  if (span <= 10 * 60_000)
    return d.toLocaleTimeString("en-US", { minute: "2-digit", second: "2-digit", hour12: false });
  if (span <= 2 * 86_400_000)
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (!isFinite(min) || !isFinite(max) || min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let t = start; t <= max + 1e-6; t += step) out.push(Math.round(t));
  // Rounding can collapse two distinct raw ticks onto the same integer when
  // the visible price range is tight (e.g. a quiet market), which produced
  // duplicate React keys downstream — dedupe here, at the source.
  return Array.from(new Set(out));
}
