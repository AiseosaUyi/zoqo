"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cents, hhmm, signedUsd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { CalendarHeatmap } from "./CalendarHeatmap";

export function OverviewTab() {
  const { tradeHistory } = useZoqo();
  const { handle } = useProfile();
  const name = handle ?? "this trader";
  const recent = tradeHistory.slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
      <Card padding="none">
        <CalendarHeatmap tradeHistory={tradeHistory} />
      </Card>

      <Card padding="none">
        <div className="border-b px-4 py-3">
          <h3 className="text-[14px] font-bold text-ink">Recent Trades</h3>
        </div>
        {recent.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-sub">
            No settled trades yet. Closed and resolved positions show here.
          </div>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b text-left text-[11px] font-medium text-sub">
                  {["Event", "Position", "Shares", "Entry Price", "Exit Price", "Result", "P&L", "Closed"].map((h) => (
                    <th key={h} className="px-4 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="nums">
                {recent.map((e, i) => (
                  // store.tsx mints history ids from Date.now(), which can collide
                  // when two trades settle within the same millisecond — fall back
                  // to the row index to keep React keys unique either way.
                  <tr key={`${e.id}-${i}`} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-ink">
                      Will BTC be above {e.strike.toLocaleString()}{" "}
                      <span className="font-normal text-sub">@ {e.label}</span>
                    </td>
                    <td className="px-4">
                      <Badge color={e.side === "up" ? "up" : "down"} size="sm">
                        {e.side === "up" ? "Up" : "Down"}
                      </Badge>
                    </td>
                    <td className="px-4">{e.shares.toLocaleString()}</td>
                    <td className="px-4">{cents(e.entryPrice)}</td>
                    <td className="px-4">{cents(e.exitPrice)}</td>
                    <td className="px-4">
                      <Badge color={e.result === "won" ? "up" : e.result === "lost" ? "down" : "gray"} size="sm">
                        {e.result === "won" ? "Won" : e.result === "lost" ? "Lost" : "Closed"}
                      </Badge>
                    </td>
                    <td className={cn("px-4 font-semibold", e.pnl >= 0 ? "text-green-500" : "text-red-500")}>
                      {signedUsd(e.pnl)}
                    </td>
                    <td className="px-4 text-sub">{hhmm(e.closedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-col items-start justify-between gap-4 rounded-[16px] bg-gray-900 p-6 text-white sm:flex-row sm:items-center">
        <div>
          <h3 className="text-[18px] font-bold">Think you can read Up/Down like {name}?</h3>
          <p className="mt-1 text-[13px] text-white/70">Zoqo is built for one thing - fast Up/Down trading</p>
        </div>
        <Link
          href="/trade"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-[13px] font-bold text-gray-900 hover:bg-gray-100"
        >
          Start Trading <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}
