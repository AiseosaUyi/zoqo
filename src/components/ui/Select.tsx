"use client";
import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  data: (SelectOption | string)[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  invalid?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
}

const SIZES = { sm: "h-8 text-[13px]", md: "h-10 text-[14px]", lg: "h-12 text-[15px]" };

/** Styled dropdown — a custom popover menu (keyboard + click-outside aware). */
export function Select({
  data,
  value,
  onChange,
  placeholder = "Select…",
  size = "md",
  invalid,
  disabled,
  fullWidth,
  className,
}: SelectProps) {
  const items = data.map((d) => (typeof d === "string" ? { value: d, label: d } : d));
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selected = items.find((it) => it.value === value);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", fullWidth ? "w-full" : "inline-block", className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-[10px] border bg-surface px-3 text-left transition-colors",
          "focus-visible:outline-none focus-visible:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-100",
          "disabled:opacity-45 disabled:pointer-events-none",
          invalid && "border-red-400",
          open && "border-purple-400 ring-2 ring-purple-100",
          SIZES[size],
        )}
      >
        <span className={cn("truncate", selected ? "text-ink" : "text-gray-400")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-sub transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute z-50 mt-1.5 max-h-64 w-full min-w-[8rem] overflow-auto rounded-[12px] border border-line bg-surface p-1 shadow-e3",
            "scroll-thin origin-top animate-[zoqo-pop_0.12s_ease-out]",
          )}
        >
          {items.map((it) => {
            const active = it.value === value;
            return (
              <button
                key={it.value}
                type="button"
                role="option"
                aria-selected={active}
                disabled={it.disabled}
                onClick={() => {
                  onChange(it.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-[13.5px] transition-colors",
                  "disabled:opacity-40 disabled:pointer-events-none",
                  active ? "bg-purple-50 font-semibold text-purple-700" : "text-ink hover:bg-gray-100",
                )}
              >
                <span className="truncate">{it.label}</span>
                {active && <Check size={15} className="shrink-0 text-purple-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
