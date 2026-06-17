import * as React from "react";
import { cn } from "@/lib/cn";

export type BadgeColor =
  | "brand" | "up" | "down" | "gray" | "orange" | "blue" | "gold" | "yellow";
export type BadgeVariant = "soft" | "solid" | "outline" | "dot";

const SOFT: Record<BadgeColor, string> = {
  brand: "bg-purple-50 text-purple-700",
  up: "bg-green-100 text-green-700",
  down: "bg-red-100 text-red-700",
  gray: "bg-gray-100 text-gray-600",
  orange: "bg-orange-100 text-orange-700",
  blue: "bg-blue-100 text-blue-700",
  gold: "bg-gold-100 text-gold-800",
  yellow: "bg-yellow-100 text-yellow-800",
};
const SOLID: Record<BadgeColor, string> = {
  brand: "bg-purple-500 text-white",
  up: "bg-green-500 text-white",
  down: "bg-red-500 text-white",
  gray: "bg-gray-900 text-white",
  orange: "bg-orange-500 text-white",
  blue: "bg-blue-500 text-white",
  gold: "bg-gold-500 text-gray-900",
  yellow: "bg-yellow-500 text-gray-900",
};
const DOT: Record<BadgeColor, string> = {
  brand: "bg-purple-500", up: "bg-green-500", down: "bg-red-500",
  gray: "bg-gray-400", orange: "bg-orange-500", blue: "bg-blue-500",
  gold: "bg-gold-500", yellow: "bg-yellow-500",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor;
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

export function Badge({
  color = "gray",
  variant = "soft",
  size = "md",
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap nums",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        variant === "soft" && SOFT[color],
        variant === "solid" && SOLID[color],
        variant === "outline" && "border border-line-strong text-ink",
        variant === "dot" && "bg-transparent text-ink px-0",
        className,
      )}
      {...rest}
    >
      {variant === "dot" && (
        <span className={cn("h-1.5 w-1.5 rounded-full", DOT[color])} />
      )}
      {children}
    </span>
  );
}
