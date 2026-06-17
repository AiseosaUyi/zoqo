"use client";
import * as React from "react";
import { LineChart } from "lucide-react";
import { Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TIMEFRAMES } from "@/lib/timeframe";

const QUICK = TIMEFRAMES.slice(0, 2); // 1m, 5m
const MORE = TIMEFRAMES.slice(2); // 15m … All

/** Chart-only zoom control (independent of the traded market): two quick frames
 *  (1m / 5m) plus a "More" dropdown for the longer ranges. */
export function ChartToolbar({
  tf,
  onTf,
  left,
  right,
}: {
  tf: string;
  onTf: (tf: string) => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const inMore = MORE.some((t) => t.key === tf);
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <LineChart size={14} className="text-sub" />
        <div className="inline-flex items-center gap-1 rounded-[10px] bg-muted p-1">
          {QUICK.map((t) => (
            <button
              key={t.key}
              onClick={() => onTf(t.key)}
              className={cn(
                "h-6 rounded-[7px] px-2.5 text-[12px] font-medium transition-colors",
                tf === t.key
                  ? "bg-white text-ink shadow-[0_1px_2px_rgba(14,17,19,0.10)]"
                  : "text-sub hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Select
          data={MORE.map((t) => ({ value: t.key, label: t.label }))}
          value={inMore ? tf : null}
          onChange={onTf}
          placeholder="More"
          size="sm"
          className="w-[92px]"
        />
        {left}
      </div>
      {right}
    </div>
  );
}
