import * as React from "react";
import { cn } from "@/lib/cn";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";
export type SpinnerColor = "brand" | "up" | "down" | "gray" | "white";

const SIZES: Record<SpinnerSize, number> = { xs: 14, sm: 18, md: 24, lg: 36 };
const STROKE: Record<SpinnerSize, number> = { xs: 2, sm: 2.5, md: 3, lg: 3.5 };
const COLORS: Record<SpinnerColor, string> = {
  brand: "text-purple-500",
  up: "text-green-500",
  down: "text-red-500",
  gray: "text-gray-400",
  white: "text-white",
};

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  size?: SpinnerSize;
  color?: SpinnerColor;
}

/** Smooth SVG circular spinner — rotating ring with an animated dash. */
export function Spinner({ size = "md", color = "brand", className, ...rest }: SpinnerProps) {
  const px = SIZES[size];
  return (
    <svg
      role="status"
      aria-label="Loading"
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("animate-spin", COLORS[color], className)}
      {...rest}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth={STROKE[size]} />
      <circle
        cx="12"
        cy="12"
        r="9.5"
        stroke="currentColor"
        strokeWidth={STROKE[size]}
        strokeLinecap="round"
        className="origin-center animate-[zoqo-spinner-dash_1.4s_ease-in-out_infinite]"
      />
    </svg>
  );
}
