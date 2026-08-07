"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { signedUsd, usdCompact } from "@/lib/format";
import { groupByDay, dayStatKey } from "@/lib/profileStats";
import type { HistoryEntry } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarHeatmap({ tradeHistory }: { tradeHistory: HistoryEntry[] }) {
  const now = new Date();
  const [cursor, setCursor] = React.useState({ year: now.getFullYear(), month: now.getMonth() });

  const byDay = React.useMemo(() => groupByDay(tradeHistory), [tradeHistory]);

  const { year, month } = cursor;
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isToday = (d: number) =>
    d === now.getDate() && month === now.getMonth() && year === now.getFullYear();

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor((c) => shiftMonth(c, -1))}
            className="grid h-7 w-7 place-items-center rounded-full border hover:bg-gray-50"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setCursor((c) => shiftMonth(c, 1))}
            className="grid h-7 w-7 place-items-center rounded-full border hover:bg-gray-50"
          >
            <ChevronRight size={14} />
          </button>
          <span className="ml-1 text-[16px] font-bold text-ink">
            {monthLabel} <span className="font-normal text-sub">{year}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 pb-1.5 text-[11px] font-medium text-sub">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} />;
          const weekend = (firstWeekday + (d - 1)) % 7 >= 5;
          const stat = byDay.get(dayStatKey(year, month, d));
          return (
            <div
              key={d}
              className={cn(
                "flex min-h-[70px] flex-col justify-between rounded-[10px] border p-2",
                weekend && !stat ? "bg-muted" : "bg-surface",
                isToday(d) && "ring-2 ring-purple-300",
              )}
            >
              <span className="text-[12px] font-semibold text-ink">{d}</span>
              {stat ? (
                <div className="leading-tight">
                  <div className={cn("text-[13px] font-bold nums", stat.pnl >= 0 ? "text-green-500" : "text-red-500")}>
                    {signedUsd(stat.pnl)}
                  </div>
                  <div className="text-[10px] text-sub nums">Vol {usdCompact(stat.volume)}</div>
                </div>
              ) : (
                <span className="text-[12px] text-sub">-</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function shiftMonth(c: { year: number; month: number }, delta: number) {
  const m = c.month + delta;
  return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
}
