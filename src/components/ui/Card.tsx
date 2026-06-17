import * as React from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  inset?: boolean;
}

const PAD = { none: "", sm: "p-3", md: "p-4", lg: "p-6" };

export function Card({ padding = "md", inset, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[16px] border bg-surface",
        inset ? "border-line" : "border-line shadow-e1",
        PAD[padding],
        className,
      )}
      {...rest}
    />
  );
}
