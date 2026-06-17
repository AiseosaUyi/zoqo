"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  data: (TabItem | string)[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md" | "lg";
  color?: "brand" | "up" | "down" | "gray";
  fullWidth?: boolean;
  className?: string;
}

const SIZES = {
  sm: "h-9 text-[13px] gap-4",
  md: "h-11 text-[14px] gap-6",
  lg: "h-12 text-[15px] gap-7",
};
const ACTIVE = {
  brand: { text: "text-purple-700", bar: "bg-purple-500" },
  up: { text: "text-green-700", bar: "bg-green-500" },
  down: { text: "text-red-700", bar: "bg-red-500" },
  gray: { text: "text-ink", bar: "bg-gray-900" },
};

/** Underline/line tabs with an animated active underline that slides between tabs. */
export function Tabs({
  data,
  value,
  onChange,
  size = "md",
  color = "brand",
  fullWidth,
  className,
}: TabsProps) {
  const items = data.map((d) => (typeof d === "string" ? { value: d, label: d } : d));
  const listRef = React.useRef<HTMLDivElement>(null);
  const [bar, setBar] = React.useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const measure = React.useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
    if (active) {
      setBar({ left: active.offsetLeft, width: active.offsetWidth });
    }
  }, [value]);

  React.useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div
      ref={listRef}
      role="tablist"
      className={cn(
        "relative flex items-center border-b border-line",
        SIZES[size],
        fullWidth && "w-full justify-stretch",
        className,
      )}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-value={it.value}
            disabled={it.disabled}
            onClick={() => onChange(it.value)}
            className={cn(
              "relative inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap font-semibold",
              "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:rounded-[6px]",
              "disabled:opacity-40 disabled:pointer-events-none",
              fullWidth && "flex-1",
              active ? ACTIVE[color].text : "text-sub hover:text-ink",
            )}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
      <span
        className={cn(
          "pointer-events-none absolute -bottom-px h-[2px] rounded-full transition-all duration-200 ease-out",
          ACTIVE[color].bar,
        )}
        style={{ left: bar.left, width: bar.width }}
      />
    </div>
  );
}
