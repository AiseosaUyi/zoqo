"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: React.ReactNode;
  formatValue?: (value: number) => string;
  color?: "brand" | "up" | "down";
  disabled?: boolean;
  className?: string;
}

const ACCENT = { brand: "accent-purple-500", up: "accent-green-500", down: "accent-red-500" };

/** Native `<input type="range">`-based slider — Build the Order's entry/
 *  stop-loss/take-profit controls use three of these. Uses the `accent-*`
 *  utility for the thumb/fill color rather than hand-rolled thumb CSS, so it
 *  stays a real native control (keyboard arrow keys, screen-reader value
 *  announcement) instead of a div-based reimplementation. */
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  formatValue,
  color = "brand",
  disabled,
  className,
}: SliderProps) {
  const display = formatValue ? formatValue(value) : String(value);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {(label != null || formatValue) && (
        <div className="flex items-center justify-between text-[12px] font-semibold text-sub">
          {label != null && <span>{label}</span>}
          <span className="nums text-ink">{display}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "h-2 w-full cursor-pointer appearance-none rounded-full bg-muted",
          ACCENT[color],
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-45",
        )}
      />
    </div>
  );
}
