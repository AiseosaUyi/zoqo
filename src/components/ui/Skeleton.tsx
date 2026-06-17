import * as React from "react";
import { cn } from "@/lib/cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: number | string;
  height?: number | string;
  /** border radius; `true` → pill, number/string → px/css */
  rounded?: boolean | number | string;
  /** render a perfect circle (uses `width` as the diameter) */
  circle?: boolean;
  /** render N stacked text lines (last line shortened) */
  lines?: number;
}

/** Moving-gradient shimmer — a tight, warm-neutral sweep over the muted track. */
const SHIMMER =
  "relative overflow-hidden bg-gray-200 " +
  "before:absolute before:inset-0 before:-translate-x-full " +
  "before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.65),transparent)] " +
  "before:bg-[length:200%_100%] before:animate-[zoqo-shimmer_1.5s_ease-in-out_infinite]";

function radiusStyle(rounded: SkeletonProps["rounded"]): string | undefined {
  if (rounded === true) return "999px";
  if (rounded == null || rounded === false) return undefined;
  return typeof rounded === "number" ? `${rounded}px` : rounded;
}

export function Skeleton({
  width,
  height,
  rounded = 8,
  circle,
  lines,
  className,
  style,
  ...rest
}: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <div className={cn("flex w-full flex-col gap-2", className)} {...rest}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn("rounded-[6px]", SHIMMER)}
            style={{
              height: height ?? 12,
              width: i === lines - 1 ? "65%" : "100%",
            }}
          />
        ))}
      </div>
    );
  }

  const size = circle ? width ?? 40 : undefined;
  return (
    <div
      className={cn(circle ? "rounded-full" : "", SHIMMER, className)}
      style={{
        width: circle ? size : width ?? "100%",
        height: circle ? size : height ?? 16,
        borderRadius: circle ? "999px" : radiusStyle(rounded),
        ...style,
      }}
      {...rest}
    />
  );
}
