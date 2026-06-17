"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import type { Market } from "@/lib/types";
import { btc, countdown } from "@/lib/format";
import { timeToX, type TimelineGeo } from "@/lib/chartGeo";
import { cn } from "@/lib/cn";

export interface MarketColumnsProps {
  markets: Market[]; // all markets (sorted); cards outside the view clip away
  geo: TimelineGeo; // shared time→x mapping (same as the chart)
  now: number; // engine clock — drives the countdowns
  liveMarketId?: string;
  selectedId?: string;
  canOlder: boolean;
  canNewer: boolean;
  onStep: (n: -1 | 1) => void; // -1 = older, +1 = newer
  onHover?: (id: string | undefined) => void; // hover a market → activity card
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void; // double-click → open single market
}

export function MarketColumns({
  markets,
  geo,
  now,
  liveMarketId,
  selectedId,
  canOlder,
  canNewer,
  onStep,
  onHover,
  onSelect,
  onActivate,
}: MarketColumnsProps) {
  return (
    <div className="relative h-[72px] overflow-hidden border-b bg-bg">
      {geo.width > 0 &&
        markets.map((m) => {
          const left = timeToX(geo, m.openTime);
          const right = timeToX(geo, m.closeTime);
          const width = right - left;
          // skip cards fully outside the viewport (+1 col of margin)
          if (right < geo.padL - width || left > geo.width) return null;
          return (
            <MarketCell
              key={m.id}
              m={m}
              now={now}
              left={left}
              width={width}
              live={m.id === liveMarketId}
              selected={m.id === selectedId}
              onHover={onHover}
              onSelect={onSelect}
              onActivate={onActivate}
            />
          );
        })}
      <Arrow side="left" show={canOlder} onClick={() => onStep(-1)} />
      <Arrow side="right" show={canNewer} onClick={() => onStep(1)} />
    </div>
  );
}

function MarketCell({
  m,
  now,
  left,
  width,
  live,
  selected,
  onHover,
  onSelect,
  onActivate,
}: {
  m: Market;
  now: number;
  left: number;
  width: number;
  live: boolean;
  selected: boolean;
  onHover?: (id: string | undefined) => void;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
}) {
  const settled = m.status === "settled";
  const up = settled ? !!m.settledUp : m.changePct >= 0;
  // mm:ss to the next state change — `now` ticks with the store (~600ms)
  const remain = settled ? 0 : (live ? m.closeTime : m.openTime) - now;

  return (
    <button
      onClick={() => onSelect?.(m.id)}
      onDoubleClick={() => onActivate?.(m.id)}
      onMouseEnter={() => onHover?.(m.id)}
      onMouseLeave={() => onHover?.(undefined)}
      title="Double-click to open this market"
      style={{ left, width }}
      className={cn(
        "group absolute inset-y-0 flex flex-col justify-center gap-1 border-r border-t-2 px-3 text-left outline-none transition-colors",
        "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-300",
        live
          ? "border-r-line border-t-purple-500 bg-purple-50"
          : selected
            ? "border-r-line border-t-purple-300 bg-purple-50/70"
            : "border-r-line border-t-transparent bg-bg hover:bg-gray-100",
      )}
    >
      {/* row 1: time label + state marker */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-ink nums">{m.label}</span>
        {live ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-purple-600">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500 pulse" />
            Live
          </span>
        ) : settled ? (
          up ? (
            <TrendingUp size={13} className="text-green-500" />
          ) : (
            <TrendingDown size={13} className="text-red-500" />
          )
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-sub">Next</span>
        )}
      </div>

      {/* row 2: the hero value — the OUTCOME for this market's state */}
      {settled ? (
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-bold nums",
            up ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600",
          )}
        >
          {up ? "UP" : "DOWN"} ${btc(Math.abs(m.lastPrice - m.strike))}
        </span>
      ) : live ? (
        <span className="text-[15px] font-bold text-ink nums">{btc(m.lastPrice)}</span>
      ) : (
        <span className="text-[15px] font-bold text-sub nums">{btc(m.strike)}</span>
      )}

      {/* row 3: quiet labelled context — strike/close always visible, countdown */}
      <div className="flex items-center gap-1 text-[10.5px] nums">
        {settled ? (
          <span className="truncate text-sub">
            Close {btc(m.lastPrice)} · Tgt {btc(m.strike)}
          </span>
        ) : live ? (
          <span className="font-semibold text-purple-600">Ends {countdown(remain)}</span>
        ) : (
          <span className="text-sub">Opens {countdown(remain)}</span>
        )}
      </div>
    </button>
  );
}

function Arrow({
  side,
  show,
  onClick,
}: {
  side: "left" | "right";
  show: boolean;
  onClick: () => void;
}) {
  if (!show) return null;
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      data-no-pan
      aria-label={side === "left" ? "Earlier markets" : "Later markets"}
      onClick={onClick}
      className={cn(
        // full-height edge control: the solid→transparent backing masks the card
        // text beneath so the chevron never floats over unreadable characters
        "group/arrow absolute inset-y-0 z-20 flex w-11 items-center",
        side === "left"
          ? "left-0 justify-start bg-gradient-to-r from-bg via-bg to-transparent pl-1"
          : "right-0 justify-end bg-gradient-to-l from-bg via-bg to-transparent pr-1",
      )}
    >
      <span className="grid h-7 w-7 place-items-center rounded-full border bg-surface text-sub shadow-sm transition group-hover/arrow:text-ink">
        <Icon size={16} />
      </span>
    </button>
  );
}
