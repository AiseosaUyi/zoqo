"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

export type RadioColor = "brand" | "up" | "down" | "gray";
export type RadioSize = "sm" | "md" | "lg";

const OUTER: Record<RadioSize, string> = {
  sm: "h-4 w-4",
  md: "h-[18px] w-[18px]",
  lg: "h-5 w-5",
};
const DOT: Record<RadioSize, string> = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};
const LABEL: Record<RadioSize, string> = {
  sm: "text-[13px]",
  md: "text-[13.5px]",
  lg: "text-[14px]",
};
const ON: Record<RadioColor, string> = {
  brand: "border-purple-500",
  up: "border-green-500",
  down: "border-red-500",
  gray: "border-gray-900",
};
const DOT_BG: Record<RadioColor, string> = {
  brand: "bg-purple-500",
  up: "bg-green-500",
  down: "bg-red-500",
  gray: "bg-gray-900",
};

export interface RadioProps {
  checked: boolean;
  onChange: () => void;
  size?: RadioSize;
  color?: RadioColor;
  disabled?: boolean;
  label?: React.ReactNode;
  name?: string;
  value?: string;
  className?: string;
}

/** Controlled single radio. Usually composed by `RadioGroup`. */
export function Radio({
  checked,
  onChange,
  size = "md",
  color = "brand",
  disabled,
  label,
  name,
  value,
  className,
}: RadioProps) {
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
        role="radio"
        aria-checked={checked}
        aria-label={typeof label === "string" ? label : value}
        disabled={disabled}
        onClick={onChange}
        data-name={name}
        data-value={value}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border bg-surface",
          "transition-[border-color,transform] duration-150 active:scale-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-1",
          OUTER[size],
          checked ? ON[color] : "border-line-strong",
        )}
      >
        <span
          className={cn(
            "rounded-full transition-transform duration-150",
            DOT[size],
            DOT_BG[color],
            checked ? "scale-100" : "scale-0",
          )}
        />
      </button>
      {label && <span className={cn("text-ink", LABEL[size])}>{label}</span>}
    </label>
  );
}

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  data: (RadioOption | string)[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  size?: RadioSize;
  color?: RadioColor;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

/** Controlled radio set with roving selection. */
export function RadioGroup({
  data,
  value,
  onChange,
  name,
  size = "md",
  color = "brand",
  orientation = "vertical",
  className,
}: RadioGroupProps) {
  const items = data.map((d) => (typeof d === "string" ? { value: d, label: d } : d));
  return (
    <div
      role="radiogroup"
      className={cn(
        "flex gap-3",
        orientation === "vertical" ? "flex-col" : "flex-row flex-wrap items-center gap-x-5",
        className,
      )}
    >
      {items.map((it) => (
        <Radio
          key={it.value}
          name={name}
          value={it.value}
          checked={it.value === value}
          onChange={() => onChange(it.value)}
          size={size}
          color={color}
          disabled={it.disabled}
          label={it.label}
        />
      ))}
    </div>
  );
}
