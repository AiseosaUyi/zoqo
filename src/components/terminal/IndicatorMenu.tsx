"use client";
import * as React from "react";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { INDICATOR_DEFS, type IndicatorId } from "@/lib/indicators";

const GROUPS = ["Overlays", "Oscillators"] as const;

/** Multi-select "Indicators" picker — same click-outside/Escape/checkmark
 *  chrome as TradeCardMenus' HeaderMenu, but toggle rather than radio
 *  semantics since more than one indicator can be active at once. */
export function IndicatorMenu({
  active,
  onToggle,
}: {
  active: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-[12px] font-semibold transition-colors",
          active.length > 0
            ? "border-purple-200 bg-purple-50 text-purple-700"
            : "border-line text-sub hover:bg-gray-50 hover:text-ink",
        )}
      >
        <SlidersHorizontal size={13} />
        Indicators
        {active.length > 0 && <span className="nums">{active.length}</span>}
        <ChevronDown size={13} className={cn("transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="absolute left-0 z-30 mt-1.5 w-56 rounded-[12px] border border-line bg-surface p-1 shadow-e3 animate-[zoqo-pop_0.12s_ease-out]"
        >
          {GROUPS.map((group) => (
            <div key={group}>
              <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-sub">
                {group}
              </div>
              {INDICATOR_DEFS.filter((d) => d.group === group).map((d) => {
                const on = active.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onToggle(d.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors",
                      on ? "font-semibold text-ink" : "text-sub hover:bg-gray-100",
                    )}
                  >
                    {d.label}
                    {on && <Check size={14} className="text-purple-600" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
