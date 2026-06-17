"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

export interface SegmentItem {
  value: string;
  label: React.ReactNode;
}

export interface SegmentedControlProps {
  data: (SegmentItem | string)[];
  value: string;
  onChange: (value: string) => void;
  size?: "xs" | "sm" | "md";
  /** active pill color */
  color?: "white" | "up" | "down" | "brand";
  fullWidth?: boolean;
  className?: string;
}

const SIZES = {
  xs: "h-6 text-[11px] p-0.5",
  sm: "h-8 text-[12px] p-1",
  md: "h-9 text-[13px] p-1",
};

const ACTIVE = {
  white: "bg-white text-ink shadow-[0_1px_2px_rgba(14,17,19,0.10)]",
  up: "bg-green-500 text-white",
  down: "bg-red-500 text-white",
  brand: "bg-purple-500 text-white",
};

/** The pill-track tabs used throughout ZOQO (Buy/Sell, timeframes, Yes/No). */
export function SegmentedControl({
  data,
  value,
  onChange,
  size = "sm",
  color = "white",
  fullWidth,
  className,
}: SegmentedControlProps) {
  const items = data.map((d) => (typeof d === "string" ? { value: d, label: d } : d));
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center rounded-[10px] bg-muted",
        SIZES[size],
        fullWidth && "flex w-full",
        className,
      )}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3 font-medium whitespace-nowrap transition-all duration-150",
              "h-full",
              active ? ACTIVE[color] : "text-sub hover:text-ink",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
