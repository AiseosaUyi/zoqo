import * as React from "react";
import { cn } from "@/lib/cn";

export interface StatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  align?: "left" | "right" | "center";
  valueColor?: "ink" | "up" | "down" | "brand";
  className?: string;
}

const VC = {
  ink: "text-ink",
  up: "text-green-500",
  down: "text-red-500",
  brand: "text-purple-600",
};

export function Stat({ label, value, align = "left", valueColor = "ink", className }: StatProps) {
  return (
    <div
      className={cn(
        "flex flex-col",
        align === "right" && "items-end text-right",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <span className="text-[12px] leading-none text-sub">{label}</span>
      <span className={cn("mt-1 text-[14px] font-bold leading-none nums", VC[valueColor])}>
        {value}
      </span>
    </div>
  );
}
