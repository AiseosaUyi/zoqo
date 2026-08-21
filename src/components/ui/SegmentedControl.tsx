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
  const btnRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Roving tabindex: only the active tab sits in the natural tab order;
  // arrow keys move both focus and selection between tabs, matching native
  // tablist behavior (role="tablist"/"tab" was already correct here, this
  // was the one piece — keyboard operability — missing).
  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next === -1) return;
    e.preventDefault();
    onChange(items[next].value);
    btnRefs.current[next]?.focus();
  }

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
      {items.map((it, idx) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            ref={(el) => {
              btnRefs.current[idx] = el;
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, idx)}
            onClick={() => onChange(it.value)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3 font-medium whitespace-nowrap transition-all duration-150",
              "h-full",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-1",
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
