"use client";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { signedUsd } from "@/lib/format";
import { useZoqo } from "@/lib/store";

/** A chronological activity feed built from real tradeHistory only. Deposits
 *  aren't logged anywhere with timestamps in store.tsx, so — per the "no
 *  fake data" rule — we don't fabricate deposit rows here. */
export function ActivityTab() {
  const { tradeHistory } = useZoqo();

  return (
    <Card padding="none">
      {tradeHistory.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-sub">
          No activity yet. Trades you place and settle show up here.
        </div>
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[680px] text-[12.5px]">
            <thead>
              <tr className="border-b text-left text-[11px] font-medium text-sub">
                {["Event", "Position", "Type", "Amount", "Date", "P&L"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="nums">
              {tradeHistory.map((e, i) => (
                // store.tsx mints history ids from Date.now(), which can collide
                // when two trades settle within the same millisecond — fall back
                // to the row index to keep React keys unique either way.
                <tr key={`${e.id}-${i}`} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-ink">
                    BTC ≥ {e.strike.toLocaleString()} <span className="font-normal text-sub">@ {e.label}</span>
                  </td>
                  <td className="px-4">
                    <Badge color={e.side === "up" ? "up" : "down"} size="sm">
                      {e.side === "up" ? "Up" : "Down"}
                    </Badge>
                  </td>
                  <td className="px-4 text-sub">{e.result === "closed" ? "Closed early" : "Trade"}</td>
                  <td className="px-4">{e.shares.toLocaleString()} Shares</td>
                  <td className="px-4 text-sub">{new Date(e.closedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className={cn("px-4 font-semibold", e.pnl >= 0 ? "text-green-500" : "text-red-500")}>
                    {signedUsd(e.pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
