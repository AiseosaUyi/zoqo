"use client";
import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { MARKET_DURATIONS } from "@/lib/timeframe";

/** Single dropdown for picking the traded market duration (5m/10m/15m/30m/1h)
 *  — replaces the old tab strip that used to live split across the top nav
 *  (desktop) and a duplicate mobile-only row. One control, all widths, lives
 *  on the page instead of the nav. Same dropdown chrome as TradeCardMenus'
 *  "Single ▾" / "Market ▾" menus for a consistent feel. */
export function DurationMenu({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const label = MARKET_DURATIONS.find((d) => d.key === value)?.label ?? value;

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
    <div ref={ref} className="relative" data-no-pan>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-[8px] bg-muted px-2.5 py-1.5 text-[13px] font-bold text-ink hover:bg-gray-100"
      >
        {label}
        <ChevronDown size={14} className={cn("text-sub transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div
          className={cn(
            "absolute left-0 z-20 mt-1.5 w-32 rounded-[12px] border border-line bg-surface p-1 shadow-e3",
            "animate-[zoqo-pop_0.12s_ease-out]",
          )}
        >
          {MARKET_DURATIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => {
                onChange(d.key);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-[13px] transition-colors",
                value === d.key ? "font-semibold text-ink" : "text-sub hover:bg-gray-100",
              )}
            >
              {d.label}
              {value === d.key && <Check size={14} className="text-purple-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
