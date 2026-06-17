"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md" | "lg";
  leftSection?: React.ReactNode;
  rightSection?: React.ReactNode;
  invalid?: boolean;
}

const SIZES = { sm: "h-8 text-[13px]", md: "h-10 text-[14px]", lg: "h-12 text-[15px]" };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ size = "md", leftSection, rightSection, invalid, className, ...rest }, ref) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-[10px] border bg-surface px-3 transition-colors",
          "focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100",
          invalid && "border-red-400 focus-within:ring-red-100",
          SIZES[size],
          className,
        )}
      >
        {leftSection && <span className="text-sub shrink-0">{leftSection}</span>}
        <input
          ref={ref}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-400 nums"
          {...rest}
        />
        {rightSection && <span className="text-sub shrink-0">{rightSection}</span>}
      </div>
    );
  },
);
