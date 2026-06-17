"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: "sm" | "md";
  color?: "brand" | "up" | "down";
  disabled?: boolean;
  label?: React.ReactNode;
  className?: string;
}

const TRACK = { sm: "h-4 w-7", md: "h-5 w-9" };
const THUMB = { sm: "h-3 w-3", md: "h-4 w-4" };
const ON = { brand: "bg-purple-500", up: "bg-green-500", down: "bg-red-500" };

export function Switch({
  checked,
  onChange,
  size = "md",
  color = "brand",
  disabled,
  label,
  className,
}: SwitchProps) {
  return (
    <label className={cn("inline-flex items-center gap-2", disabled && "opacity-50", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200",
          TRACK[size],
          checked ? ON[color] : "bg-gray-300",
        )}
      >
        <span
          className={cn(
            "inline-block translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200",
            THUMB[size],
            checked && (size === "md" ? "translate-x-[18px]" : "translate-x-[14px]"),
          )}
        />
      </button>
      {label && <span className="text-[13px] text-ink select-none">{label}</span>}
    </label>
  );
}
