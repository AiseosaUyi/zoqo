"use client";
import * as React from "react";
import { TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cents, signedUsd, usd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import type { Position } from "@/lib/types";

export function PositionsTab() {
  const { positions, getMarket, sell, netPnl } = useZoqo();

  const rows = React.useMemo(
    () =>
      positions.map((p) => {
        const m = getMarket(p.marketId);
        const cur = m ? (p.side === "up" ? m.yes : 100 - m.yes) : p.avgPrice;
        const value = p.shares * (cur / 100);
        return { p, m, cur, value, pnl: value - p.cost };
      }),
    [positions, getMarket],
  );
  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  const closeAll = (subset: Position[]) => subset.forEach((p) => sell(p.marketId, p.side));
  const profitable = rows.filter((r) => r.pnl > 0).map((r) => r.p);
  const losing = rows.filter((r) => r.pnl < 0).map((r) => r.p);

  return (
    <Card padding="none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="soft"
            color="gray"
            leftIcon={<XCircle size={13} />}
            disabled={positions.length === 0}
            onClick={() => closeAll(positions)}
          >
            Close All Positions
          </Button>
          <Button
            size="sm"
            variant="soft"
            color="up"
            leftIcon={<TrendingUp size={13} />}
            disabled={profitable.length === 0}
            onClick={() => closeAll(profitable)}
          >
            Close All Profitable
          </Button>
          <Button
            size="sm"
            variant="soft"
            color="down"
            leftIcon={<TrendingDown size={13} />}
            disabled={losing.length === 0}
            onClick={() => closeAll(losing)}
          >
            Close All Losing
          </Button>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-sub">
          <span>
            Total Value: <b className="text-ink nums">{usd(totalValue)}</b>
          </span>
          <span>
            P&amp;L:{" "}
            <b className={cn("nums", netPnl >= 0 ? "text-green-500" : "text-red-500")}>{signedUsd(netPnl)}</b>
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-sub">
          No open positions yet. Pick a market and trade Up or Down.
        </div>
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[840px] text-[12.5px]">
            <thead>
              <tr className="border-b text-left text-[11px] font-medium text-sub">
                {["Event", "Position", "Shares", "Avg Buy", "Total Buy", "Current", "Value", "P&L", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="nums">
              {rows.map(({ p, m, cur, value, pnl }, i) => {
                const pnlPct = p.cost ? (pnl / p.cost) * 100 : 0;
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-ink">
                      BTC {m?.strike ? `${p.side === "up" ? "≥" : "<"} ${m.strike.toLocaleString()}` : ""}{" "}
                      <span className="font-normal text-sub">@ {m?.label}</span>
                    </td>
                    <td className="px-4">
                      <Badge color={p.side === "up" ? "up" : "down"} size="sm">
                        {p.side === "up" ? "Up" : "Down"}
                      </Badge>
                    </td>
                    <td className="px-4">{p.shares.toLocaleString()}</td>
                    <td className="px-4">{cents(p.avgPrice)}</td>
                    <td className="px-4">{usd(p.cost)}</td>
                    <td className="px-4">{cents(cur)}</td>
                    <td className="px-4">{usd(value)}</td>
                    <td className={cn("px-4 font-semibold", pnl >= 0 ? "text-green-500" : "text-red-500")}>
                      {signedUsd(pnl)} ({pnlPct >= 0 ? "+" : ""}
                      {pnlPct.toFixed(1)}%)
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="xs" variant="soft" color="gray" onClick={() => sell(p.marketId, p.side)}>
                        Sell
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
