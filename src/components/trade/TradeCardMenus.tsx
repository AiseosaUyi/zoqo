"use client";
import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** Shared dropdown chrome for the small header menus in TradeCard (order type,
 *  single/bulk panel mode). Click-outside + Escape to close, checkmark on the
 *  active item — mirrors the Figma "Market ▾" / "Single ▾" dropdowns. */
function HeaderMenu<T extends string>({
  value,
  options,
  labels,
  onChange,
  align = "left",
  className,
}: {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[13px] font-bold text-ink hover:text-purple-600"
      >
        {labels[value]}
        <ChevronDown size={14} className={cn("text-sub transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div
          className={cn(
            "absolute z-20 mt-1.5 w-40 rounded-[12px] border border-line bg-surface p-1 shadow-e3",
            "animate-[zoqo-pop_0.12s_ease-out]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-[13px] transition-colors",
                value === opt ? "font-semibold text-ink" : "text-sub hover:bg-gray-100",
              )}
            >
              {labels[opt]}
              {value === opt && <Check size={14} className="text-purple-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- order type: Market / Limit / One Tap --------------------------- */

export type OrderType = "market" | "limit" | "oneTap";
const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  market: "Market",
  limit: "Limit",
  oneTap: "One Tap",
};

export function OrderTypeMenu({
  value,
  onChange,
  className,
}: {
  value: OrderType;
  onChange: (v: OrderType) => void;
  className?: string;
}) {
  return (
    <HeaderMenu
      value={value}
      options={["market", "limit", "oneTap"] as const}
      labels={ORDER_TYPE_LABEL}
      onChange={onChange}
      align="right"
      className={className}
    />
  );
}

/* ---- panel mode: Single / Bulk Order --------------------------------- */

export type PanelMode = "single" | "bulk";
const PANEL_MODE_LABEL: Record<PanelMode, string> = {
  single: "Single",
  bulk: "Bulk Order",
};

export function PanelModeMenu({
  value,
  onChange,
  className,
}: {
  value: PanelMode;
  onChange: (v: PanelMode) => void;
  className?: string;
}) {
  return (
    <HeaderMenu
      value={value}
      options={["single", "bulk"] as const}
      labels={PANEL_MODE_LABEL}
      onChange={onChange}
      align="left"
      className={className}
    />
  );
}
