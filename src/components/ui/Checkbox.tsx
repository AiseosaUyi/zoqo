"use client";
import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

export type CheckboxColor = "brand" | "up" | "down" | "gray";
export type CheckboxSize = "sm" | "md" | "lg";

const BOX: Record<CheckboxSize, string> = {
  sm: "h-4 w-4 rounded-[5px]",
  md: "h-[18px] w-[18px] rounded-[6px]",
  lg: "h-5 w-5 rounded-[6px]",
};
const ICON: Record<CheckboxSize, number> = { sm: 11, md: 13, lg: 15 };
const LABEL: Record<CheckboxSize, string> = {
  sm: "text-[13px]",
  md: "text-[13.5px]",
  lg: "text-[14px]",
};
const ON: Record<CheckboxColor, string> = {
  brand: "bg-purple-500 border-purple-500",
  up: "bg-green-500 border-green-500",
  down: "bg-red-500 border-red-500",
  gray: "bg-gray-900 border-gray-900",
};

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  indeterminate?: boolean;
  size?: CheckboxSize;
  color?: CheckboxColor;
  disabled?: boolean;
  label?: React.ReactNode;
  className?: string;
}

/** Controlled checkbox with a check icon, indeterminate state, sizes and colors. */
export function Checkbox({
  checked,
  onChange,
  indeterminate,
  size = "md",
  color = "brand",
  disabled,
  label,
  className,
}: CheckboxProps) {
  const on = checked || indeterminate;
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 select-none",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? "mixed" : checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "inline-flex shrink-0 items-center justify-center border text-white",
          "transition-[background,border-color,transform] duration-150 active:scale-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-1",
          BOX[size],
          on ? ON[color] : "border-line-strong bg-surface",
        )}
      >
        {indeterminate ? (
          <Minus size={ICON[size]} strokeWidth={3.5} className="text-white" />
        ) : (
          <Check
            size={ICON[size]}
            strokeWidth={3.5}
            className={cn("transition-transform duration-150", checked ? "scale-100" : "scale-0")}
          />
        )}
      </button>
      {label && <span className={cn("text-ink", LABEL[size])}>{label}</span>}
    </label>
  );
}
