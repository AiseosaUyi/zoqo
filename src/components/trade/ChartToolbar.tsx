"use client";
import * as React from "react";
import { LineChart } from "lucide-react";
import { Select, SegmentedControl } from "@/components/ui";
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
        <SegmentedControl
          data={QUICK.map((t) => ({ value: t.key, label: t.label }))}
          value={tf}
          onChange={onTf}
          size="xs"
        />
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
