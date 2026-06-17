import * as React from "react";
import { cn } from "@/lib/cn";

export type ProgressColor = "brand" | "up" | "down" | "gold" | "blue" | "gray";
export type ProgressSize = "xs" | "sm" | "md" | "lg";

const TRACK: Record<ProgressSize, string> = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2",
  lg: "h-3",
};
const BAR: Record<ProgressColor, string> = {
  brand: "bg-purple-500",
  up: "bg-green-500",
  down: "bg-red-500",
  gold: "bg-gold-500",
  blue: "bg-blue-500",
  gray: "bg-gray-400",
};

export interface ProgressProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "color"> {
  /** 0–100; ignored when `indeterminate` */
  value?: number;
  color?: ProgressColor;
  size?: ProgressSize;
  indeterminate?: boolean;
}

/** Linear progress bar with a determinate fill and an animated indeterminate mode. */
export function Progress({
  value = 0,
  color = "brand",
  size = "md",
  indeterminate,
  className,
  ...rest
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      className={cn("relative w-full overflow-hidden rounded-full bg-gray-200", TRACK[size], className)}
      {...rest}
    >
      {indeterminate ? (
        <span
          className={cn(
            "absolute inset-y-0 rounded-full animate-[zoqo-progress-indeterminate_1.5s_ease-in-out_infinite]",
            BAR[color],
          )}
        />
      ) : (
        <span
          className={cn("block h-full rounded-full transition-[width] duration-300 ease-out", BAR[color])}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}
