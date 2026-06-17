"use client";
import * as React from "react";
import type { HistoryEntry, Market, Position } from "@/lib/types";
import { btc, cents, countdown, signedUsd, usdCompact } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Hover summary for one market: outcome, traded volume, and the user's P&L
 *  (unrealized for the live position, realized once it has settled). */
export function MarketActivityCard({
  market: m,
  position,
  history,
  volumeUsd,
  bigTrades,
  now,
  style,
}: {
  market: Market;
  position?: Position;
  history: HistoryEntry[];
  volumeUsd: number;
  bigTrades: number;
  now: number;
  style: React.CSSProperties;
}) {
  const settled = m.status === "settled";
  const live = m.status === "live";

  // your activity: open position (live) → unrealized; settled → realized from history
  const cur = position ? (position.side === "up" ? m.yes : 100 - m.yes) : 0;
  const unrealized = position ? position.shares * (cur / 100) - position.cost : 0;
  const realizedPnl = history.reduce((s, e) => s + e.pnl, 0);
  const realizedShares = history.reduce((s, e) => s + e.shares, 0);
  const hasOpen = !!position;
  const hasHistory = history.length > 0;
  const pnl = hasOpen ? unrealized : realizedPnl;
  const pnlPct = hasOpen
    ? position!.cost
      ? (unrealized / position!.cost) * 100
      : 0
    : null;
  const tradedSide = hasOpen ? position!.side : history[0]?.side;
  const tradedShares = hasOpen ? position!.shares : realizedShares;

  return (
    <div
      style={style}
      className="pointer-events-none absolute z-30 w-[210px] rounded-xl border bg-surface p-3 shadow-[0_10px_30px_rgba(22,20,15,0.16)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-ink nums">{m.label}</span>
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            settled
              ? m.settledUp
                ? "bg-green-50 text-green-600"
                : "bg-red-50 text-red-600"
              : live
                ? "bg-purple-50 text-purple-600"
                : "bg-gray-100 text-sub",
          )}
        >
          {settled ? (m.settledUp ? "Settled Up" : "Settled Down") : live ? "Live" : "Upcoming"}
        </span>
      </div>

      <p className="mt-0.5 text-[11px] text-sub nums">
        {settled
          ? `Closed ${btc(m.lastPrice)} · Target ${btc(m.strike)}`
          : live
            ? `Now ${btc(m.lastPrice)} · ${Math.round(m.yes)}¢ Up`
            : `Opens ${countdown(m.openTime - now)} · Target ${btc(m.strike)}`}
      </p>

      {/* market activity */}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2 text-[11px]">
        <span className="text-sub">Volume</span>
        <span className="text-right font-semibold text-ink nums">{usdCompact(volumeUsd)}</span>
        <span className="text-sub">Big trades</span>
        <span className="text-right font-semibold text-ink nums">{bigTrades}</span>
      </div>

      {/* your P&L */}
      <div className="mt-2 border-t pt-2">
        {hasOpen || hasHistory ? (
          <>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-sub">
                {tradedSide === "up" ? "Up" : "Down"} · {tradedShares.toLocaleString()} sh
                {hasOpen ? ` @ ${cents(position!.avgPrice)}` : ""}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-sub">
                {hasOpen ? "Unrealized" : "Realized"}
              </span>
            </div>
            <div
              className={cn(
                "mt-0.5 text-[14px] font-bold nums",
                pnl >= 0 ? "text-green-500" : "text-red-500",
              )}
            >
              {signedUsd(pnl)}
              {pnlPct != null && (
                <span className="ml-1 text-[11px] font-semibold">
                  ({pnlPct >= 0 ? "+" : ""}
                  {pnlPct.toFixed(1)}%)
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-sub">
            {m.status === "upcoming" ? "Not open for trading yet." : "You didn’t trade this market."}
          </p>
        )}
      </div>
    </div>
  );
}
