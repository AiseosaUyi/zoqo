"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { TIER_PCTS, tierRangeLabel } from "@/lib/referrals";

export function EarningTierLadder({
  title,
  unit,
  currentIdx,
  theme,
}: {
  title: string;
  unit: "" | "K";
  currentIdx: number;
  theme: "brand" | "up";
}) {
  const active =
    theme === "brand"
      ? "border-purple-400 bg-purple-50 text-purple-700"
      : "border-green-400 bg-green-50 text-green-700";
  const activePct = theme === "brand" ? "text-purple-600" : "text-green-600";

  return (
    <div>
      <h3 className={cn("text-[12px] font-bold", theme === "brand" ? "text-purple-600" : "text-green-600")}>
        {title}
      </h3>
      <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {TIER_PCTS.map((pct, i) => {
          const isActive = i === currentIdx;
          return (
            <div
              key={i}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-[10px] border py-2.5 text-center",
                isActive ? active : "border-line bg-muted text-sub",
              )}
            >
              <span className="text-[10.5px] font-semibold uppercase tracking-wide opacity-80">
                Tier {i + 1}
              </span>
              <span className={cn("text-[17px] font-black nums", isActive ? activePct : "text-gray-400")}>
                {pct}%
              </span>
              <span className="text-[10px] nums opacity-70">{tierRangeLabel(i, unit)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
