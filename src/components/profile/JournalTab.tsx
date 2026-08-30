"use client";
import * as React from "react";
import { Badge, Card, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/cn";
import { signedUsd } from "@/lib/format";
import { useTradeJournal, type JournalSource } from "@/lib/tradeJournal";

const SCOPES = [
  { value: "all", label: "All" },
  { value: "predict", label: "Predict" },
  { value: "terminal", label: "Terminal" },
];

/** Unified closed-trade log across the prediction market and the Terminal —
 *  one wallet, one journal. Aggregate P&L up top, every closed trade from
 *  either product as its own row below, newest first. */
export function JournalTab() {
  const [scope, setScope] = React.useState<"all" | JournalSource>("all");
  const { filtered, totals } = useTradeJournal(scope);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[12px] text-sub">Total P&amp;L</div>
          <div className={cn("mt-1 font-bebas text-[34px] leading-none nums", totals.pnl >= 0 ? "text-green-500" : "text-red-500")}>
            {signedUsd(totals.pnl)}
          </div>
          <div className="mt-1.5 text-[11.5px] text-sub">
            <b className="text-ink nums">{totals.trades}</b> Trade{totals.trades === 1 ? "" : "s"} &nbsp;|&nbsp;{" "}
            <b className="text-ink nums">{Math.round(totals.winRate * 100)}%</b> Win Rate
          </div>
        </div>
        <SegmentedControl
          data={SCOPES}
          value={scope}
          onChange={(v) => setScope(v as typeof scope)}
          size="sm"
        />
      </Card>

      <Card padding="none">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-sub">
            No closed trades yet. Trades you close or settle on Predict or Terminal show up here.
          </div>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[680px] text-[12.5px]">
              <thead>
                <tr className="border-b text-left text-[11px] font-medium text-sub">
                  {["Trade", "Source", "Side", "Size", "Date", "P&L"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="nums">
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-ink">{e.title}</td>
                    <td className="px-4">
                      <Badge color={e.source === "predict" ? "brand" : "blue"} size="sm">
                        {e.source === "predict" ? "Predict" : "Terminal"}
                      </Badge>
                    </td>
                    <td className="px-4">
                      <Badge color={e.sideColor} size="sm">
                        {e.sideLabel}
                      </Badge>
                    </td>
                    <td className="px-4">{e.sizeLabel}</td>
                    <td className="px-4 text-sub">
                      {new Date(e.closedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
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
    </div>
  );
}
