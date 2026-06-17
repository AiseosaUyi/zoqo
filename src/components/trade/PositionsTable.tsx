"use client";
import * as React from "react";
import { Badge, Button, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cents, hhmm, signedUsd, usd } from "@/lib/format";
import { useZoqo } from "@/lib/store";

export function PositionsTable() {
  const { positions, openOrders, tradeHistory, getMarket, sell, cancelOrder, netPnl, exposure } =
    useZoqo();
  const [tab, setTab] = React.useState("Positions");
  const counts: Record<string, number> = {
    Positions: positions.length,
    "Open Trades": openOrders.length,
    History: tradeHistory.length,
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedControl
          data={["Positions", "Open Trades", "History"].map((t) => ({
            value: t,
            label: counts[t] ? `${t} ${counts[t]}` : t,
          }))}
          value={tab}
          onChange={setTab}
          size="sm"
        />
        <div className="ml-auto flex items-center gap-5">
          <span className="text-[12px] text-sub">
            Net P&L{" "}
            <b className={cn("nums", netPnl >= 0 ? "text-green-500" : "text-red-500")}>
              {signedUsd(netPnl)}
            </b>
          </span>
          <span className="text-[12px] text-sub">
            Exposure <b className="text-ink nums">{usd(exposure)}</b>
          </span>
        </div>
      </div>

      {tab === "Open Trades" && <OpenTrades orders={openOrders} onCancel={cancelOrder} />}
      {tab === "History" && <HistoryView entries={tradeHistory} />}

      {tab === "Positions" &&
        (positions.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-sub">
          No open positions yet. Pick a market and trade Up or Down.
        </div>
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[840px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] font-medium text-sub">
                {["Event", "Position", "Shares", "Avg Buy", "Total Buy", "Current", "Value", "To win", "PNL", ""].map(
                  (h) => (
                    <th key={h} className="pb-2 font-medium first:pl-1">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="nums">
              {positions.map((p, i) => {
                const m = getMarket(p.marketId);
                const cur = m ? (p.side === "up" ? m.yes : 100 - m.yes) : p.avgPrice;
                const value = p.shares * (cur / 100);
                const pnl = value - p.cost;
                const pnlPct = p.cost ? (pnl / p.cost) * 100 : 0;
                return (
                  <tr key={i} className="border-t">
                    <td className="py-2.5 pl-1 font-semibold text-ink">
                      BTC {m?.strike ? `${p.side === "up" ? "≥" : "<"} ${m.strike.toLocaleString()}` : ""}{" "}
                      <span className="font-normal text-sub">
                        @ {m?.label}
                        {m?.status === "settled" ? " · closed" : m?.status === "live" ? " · live" : ""}
                      </span>
                    </td>
                    <td>
                      <Badge color={p.side === "up" ? "up" : "down"} size="sm">
                        {p.side === "up" ? "Up" : "Down"}
                      </Badge>
                    </td>
                    <td>{p.shares.toLocaleString()}</td>
                    <td>{cents(p.avgPrice)}</td>
                    <td>{usd(p.cost)}</td>
                    <td>{cents(cur)}</td>
                    <td>{usd(value)}</td>
                    <td className="font-semibold text-ink">{usd(p.shares)}</td>
                    <td className={cn("font-semibold", pnl >= 0 ? "text-green-500" : "text-red-500")}>
                      {signedUsd(pnl)} ({pnlPct >= 0 ? "+" : ""}
                      {pnlPct.toFixed(1)}%)
                    </td>
                    <td className="pr-1 text-right">
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
        ))}
    </div>
  );
}

function OpenTrades({
  orders,
  onCancel,
}: {
  orders: import("@/lib/types").OpenOrder[];
  onCancel: (id: string) => void;
}) {
  if (orders.length === 0)
    return (
      <div className="py-10 text-center text-[13px] text-sub">
        No working orders. Limit orders you place will rest here until filled.
      </div>
    );
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[680px] text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] font-medium text-sub">
            {["Event", "Side", "Shares", "Limit", "Filled", "Placed", "Status", ""].map((h) => (
              <th key={h} className="pb-2 font-medium first:pl-1">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="nums">
          {orders.map((o) => (
            <tr key={o.id} className="border-t">
              <td className="py-2.5 pl-1 font-semibold text-ink">
                BTC ≥ {o.strike.toLocaleString()}{" "}
                <span className="font-normal text-sub">@ {o.label}</span>
              </td>
              <td>
                <Badge color={o.side === "up" ? "up" : "down"} size="sm">
                  {o.side === "up" ? "Up" : "Down"}
                </Badge>
              </td>
              <td>{o.shares.toLocaleString()}</td>
              <td>{cents(o.limitPrice)}</td>
              <td>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-purple-500" style={{ width: `${o.filledPct}%` }} />
                  </div>
                  <span className="text-[11px] text-sub">{o.filledPct}%</span>
                </div>
              </td>
              <td className="text-sub">{hhmm(o.placedAt)}</td>
              <td>
                <Badge color={o.status === "partial" ? "gold" : "blue"} size="sm">
                  {o.status === "partial" ? "Partial" : "Working"}
                </Badge>
              </td>
              <td className="pr-1 text-right">
                <Button size="xs" variant="soft" color="gray" onClick={() => onCancel(o.id)}>
                  Cancel
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryView({ entries }: { entries: import("@/lib/types").HistoryEntry[] }) {
  if (entries.length === 0)
    return (
      <div className="py-10 text-center text-[13px] text-sub">
        No settled trades yet. Closed and resolved positions show here.
      </div>
    );
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[680px] text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] font-medium text-sub">
            {["Event", "Side", "Shares", "Entry", "Exit", "Result", "P&L", "Closed"].map((h) => (
              <th key={h} className="pb-2 font-medium first:pl-1">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="nums">
          {entries.map((e) => (
            <tr key={e.id} className="border-t">
              <td className="py-2.5 pl-1 font-semibold text-ink">
                BTC ≥ {e.strike.toLocaleString()}{" "}
                <span className="font-normal text-sub">@ {e.label}</span>
              </td>
              <td>
                <Badge color={e.side === "up" ? "up" : "down"} size="sm">
                  {e.side === "up" ? "Up" : "Down"}
                </Badge>
              </td>
              <td>{e.shares.toLocaleString()}</td>
              <td>{cents(e.entryPrice)}</td>
              <td>{cents(e.exitPrice)}</td>
              <td>
                <Badge
                  color={e.result === "won" ? "up" : e.result === "lost" ? "down" : "gray"}
                  size="sm"
                >
                  {e.result === "won" ? "Won" : e.result === "lost" ? "Lost" : "Closed"}
                </Badge>
              </td>
              <td className={cn("font-semibold", e.pnl >= 0 ? "text-green-500" : "text-red-500")}>
                {signedUsd(e.pnl)}
              </td>
              <td className="text-sub">{hhmm(e.closedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
