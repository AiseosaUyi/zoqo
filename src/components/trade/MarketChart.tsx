"use client";
import * as React from "react";
import type { Market, ProbPoint, Side, Spike, VolumeBucket } from "@/lib/types";
import type { PricePoint } from "@/lib/store";
import { btc, hhmm, hhmmss, usdCompact } from "@/lib/format";
import { clamp } from "@/lib/math";
import { useMeasure } from "./useMeasure";

const WINDOW = 5 * 60_000;

export interface MarketChartProps {
  priceSeries: PricePoint[];
  markets: Market[];
  liveMarketId?: string;
  focusMarketId?: string; // single mode: the market we're trading
  prob?: ProbPoint[];
  volume?: VolumeBucket[];
  spikes?: Spike[];
  mode: "multi" | "single";
  showSignals: boolean;
  showColumns: boolean;
  rangeMs?: number; // when set, the price x-domain is the last `rangeMs` of data
  viewStart?: number; // forced x-domain start (multi timeline — aligns with header)
  viewEnd?: number; // forced x-domain end
  now?: number; // engine clock, for the "now" marker + future zone
  probSide?: Side; // which side's probability the signals chart shows (default up/yes)
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
  prob = [],
  volume = [],
  spikes = [],
  mode,
  showSignals,
  showColumns,
  rangeMs,
  viewStart,
  viewEnd,
  now,
  probSide = "up",
  onColumnActivate,
  width,
  height,
}: MarketChartProps & { width: number; height: number }) {
  const focus = markets.find((m) => m.id === focusMarketId);

  // ---- layout ----
  const padL = showSignals ? 44 : 8;
  const padR = 64;
  const padT = 14;
  const priceAxisH = 16; // time labels under the price chart
  const gap = showSignals ? priceAxisH + 8 : 0;
  const probH = showSignals ? 76 : 0;
  const volH = showSignals ? 42 : 0;
  const sigAxisH = showSignals ? 14 : 0; // window labels under the signals
  const bottomAxisH = showSignals ? 0 : 18;
  const priceH = Math.max(
    110,
    height - padT - gap - probH - volH - sigAxisH - bottomAxisH,
  );
  const priceTop = padT;
  const priceBot = padT + priceH;
  const priceAxisY = priceBot + 12;
  const probTop = priceBot + gap;
  const probBot = probTop + probH;
  const volTop = probBot;
  const volBot = volTop + volH;
  const sigAxisY = volBot + 11;

  const plotL = padL;
  const plotR = width - padR;
  const plotW = Math.max(1, plotR - plotL);

  // signals use their OWN x-scale: the focused market's window (50¢ → close)
  const sigA = focus?.openTime ?? 0;
  const sigB = focus?.closeTime ?? 1;
  const xSig = (t: number) =>
    plotL + clamp((t - sigA) / ((sigB - sigA) || 1), 0, 1) * plotW;
  const sideVal = (yes: number) => (probSide === "down" ? 100 - yes : yes);

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

  // ---- prob (focused market's window, side-adjusted, starts ~50¢) ----
  const probY = (c: number) => probBot - (c / 100) * probH;
  const probPts = prob.filter((p) => p.t >= sigA && p.t <= sigB);
  const probLine = probPts.map(
    (p) => `${xSig(p.t).toFixed(1)},${probY(sideVal(p.yes)).toFixed(1)}`,
  );
  const probLinePath = probLine.length ? `M${probLine.join(" L")}` : "";
  const probArea =
    probLine.length > 1
      ? `${probLinePath} L${xSig(probPts.at(-1)!.t).toFixed(1)},${probBot} L${xSig(
          probPts[0].t,
        ).toFixed(1)},${probBot} Z`
      : "";
  const lastYes = sideVal(probPts.at(-1)?.yes ?? focus?.yes ?? 50);

  // ---- volume (focused market's window) ----
  const vBuckets = volume.filter((b) => b.t >= sigA && b.t <= sigB);
  const vMax = Math.max(1, ...vBuckets.map((b) => b.up + b.down));
  const barW = vBuckets.length > 1 ? Math.max(1.5, (plotW / vBuckets.length) * 0.62) : 4;

  const gridId = React.useId();
  const [hover, setHover] = React.useState<{ s: Spike; cx: number; cy: number } | null>(null);

  return (
    <svg width={width} height={height} className="block select-none">
      <defs>
        <linearGradient id={`prob-${gridId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-green-500)" stopOpacity="0.30" />
          <stop offset="100%" stopColor="var(--color-green-500)" stopOpacity="0.02" />
        </linearGradient>
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
            height={(volBot || priceBot) - priceTop}
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
                y2={volBot || priceBot}
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
          y={showSignals ? priceAxisY : priceBot + 14}
          fontSize={10.5}
          textAnchor="middle"
          className="nums"
          fill="var(--color-sub)"
        >
          {fmtTick(t, span)}
        </text>
      ))}

      {/* ===== signals: YES/NO odds for THIS market over its window ===== */}
      {showSignals && (
        <>
          {/* ¢ axis */}
          {[100, 60, 20, 0].map((c) => (
            <text
              key={`cy${c}`}
              x={plotL - 8}
              y={probY(c) + 3}
              fontSize={10}
              textAnchor="end"
              className="nums"
              fill="var(--color-sub)"
            >
              {c}¢
            </text>
          ))}
          {/* 50¢ midline — every market opens here */}
          <line
            x1={plotL}
            y1={probY(50)}
            x2={plotR}
            y2={probY(50)}
            stroke="var(--color-line-strong)"
            strokeDasharray="3 4"
            strokeWidth={1}
          />
          {/* side caption */}
          <text
            x={plotL + 2}
            y={probTop + 10}
            fontSize={10}
            fontWeight={700}
            fill={probSide === "up" ? "var(--color-green-600)" : "var(--color-red-600)"}
          >
            {probSide === "up" ? "Up (YES)" : "Down (NO)"} odds
          </text>
          {probArea && <path d={probArea} fill={`url(#prob-${gridId})`} />}
          {probLinePath && (
            <path d={probLinePath} fill="none" stroke="var(--color-green-500)" strokeWidth={1.75} />
          )}
          {/* current odds tag */}
          <g>
            <rect x={plotR + 2} y={probY(lastYes) - 8} width={34} height={16} rx={4} fill="var(--color-green-500)" />
            <text x={plotR + 19} y={probY(lastYes) + 3.5} fontSize={10} fontWeight={700} textAnchor="middle" fill="#fff" className="nums">
              {Math.round(lastYes)}¢
            </text>
          </g>
          {/* volume bars (under the odds line, same window) */}
          {vBuckets.map((b, i) => {
            const h = ((b.up + b.down) / vMax) * (volH - 6);
            return (
              <rect
                key={`v${i}`}
                x={xSig(b.t) - barW / 2}
                y={volBot - h}
                width={barW}
                height={Math.max(0, h)}
                rx={1}
                fill="var(--color-blue-100)"
              />
            );
          })}
          <text x={plotL - 8} y={volBot} fontSize={10} textAnchor="end" fill="var(--color-sub)">
            Vol
          </text>
          {/* window labels */}
          <text x={plotL} y={sigAxisY} fontSize={10} className="nums" fill="var(--color-sub)">
            {hhmm(sigA)} open
          </text>
          <text x={plotR} y={sigAxisY} fontSize={10} textAnchor="end" className="nums" fill="var(--color-sub)">
            {hhmm(sigB)} close
          </text>

          {/* spike bulbs — major buys/sells; hover for details */}
          {spikes
            .filter((s) => s.ts >= sigA && s.ts <= sigB)
            .map((s) => {
              const cx = xSig(s.ts);
              const cy = probY(sideVal(s.price));
              const isHover = hover?.s.id === s.id;
              const color = s.side === "up" ? "var(--color-green-500)" : "var(--color-red-500)";
              return (
                <g
                  key={s.id}
                  onMouseEnter={() => setHover({ s, cx, cy })}
                  onMouseLeave={() => setHover((h) => (h?.s.id === s.id ? null : h))}
                  style={{ cursor: "pointer" }}
                >
                  <circle cx={cx} cy={cy} r={11} fill="transparent" />
                  {isHover && (
                    <circle cx={cx} cy={cy} r={(s.whale ? 5 : 3) + 5} fill={color} opacity={0.18} />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={(s.whale ? 5 : 3) + (isHover ? 1.5 : 0)}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={s.whale ? 1.5 : 1}
                  />
                </g>
              );
            })}

          {/* hover tooltip for a spike bulb */}
          {hover &&
            (() => {
              const { s, cx, cy } = hover;
              const w = 176;
              const h = 42;
              const tx = clamp(cx - w / 2, plotL, plotR - w);
              const ty = clamp(cy - h - 12, 4, probBot);
              const dot = s.side === "up" ? "var(--color-green-400)" : "var(--color-red-400)";
              const arrowY = ty + h;
              return (
                <g pointerEvents="none" style={{ filter: "drop-shadow(0 6px 16px rgba(22,20,15,0.28))" }}>
                  <path d={`M${cx - 6} ${arrowY} L${cx + 6} ${arrowY} L${cx} ${arrowY + 7} Z`} fill="var(--color-ink)" />
                  <rect x={tx} y={ty} width={w} height={h} rx={10} fill="var(--color-ink)" />
                  <circle cx={tx + 14} cy={ty + 15} r={3.5} fill={dot} />
                  <text x={tx + 24} y={ty + 18.5} fontSize={11.5} fontWeight={700} fill="#fff">
                    {s.whale ? "🐋 Whale buy" : "Purchase"}
                  </text>
                  <text x={tx + 14} y={ty + 33} fontSize={10.5} fill="rgba(255,255,255,0.72)" className="nums">
                    {s.side === "up" ? "Up" : "Down"} · {usdCompact(s.notional)} · {hhmmss(s.ts)}
                  </text>
                </g>
              );
            })()}
        </>
      )}
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
  return out;
}
