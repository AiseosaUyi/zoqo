"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AccordionItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  data: AccordionItem[];
  /** controlled open value(s); omit for uncontrolled */
  value?: string | string[] | null;
  defaultValue?: string | string[] | null;
  onChange?: (value: string | string[] | null) => void;
  /** allow several panels open at once */
  multiple?: boolean;
  className?: string;
}

function toSet(v: string | string[] | null | undefined): Set<string> {
  if (v == null) return new Set();
  return new Set(Array.isArray(v) ? v : [v]);
}

/** Collapsible sections with smooth height animation (CSS grid-rows transition). */
export function Accordion({
  data,
  value,
  defaultValue = null,
  onChange,
  multiple,
  className,
}: AccordionProps) {
  const controlled = value !== undefined;
  const [internal, setInternal] = React.useState<Set<string>>(() => toSet(defaultValue));
  const open = controlled ? toSet(value) : internal;

  const toggle = (v: string) => {
    const next = new Set(open);
    if (next.has(v)) next.delete(v);
    else {
      if (!multiple) next.clear();
      next.add(v);
    }
    if (!controlled) setInternal(next);
    const arr = [...next];
    onChange?.(multiple ? arr : (arr[0] ?? null));
  };

  return (
    <div className={cn("divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface", className)}>
      {data.map((it) => {
        const isOpen = open.has(it.value);
        return (
          <div key={it.value}>
            <button
              type="button"
              aria-expanded={isOpen}
              disabled={it.disabled}
              onClick={() => toggle(it.value)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:-ring-offset-1",
                "disabled:opacity-40 disabled:pointer-events-none",
                isOpen ? "text-ink" : "text-ink hover:bg-gray-50",
              )}
            >
              {it.icon && <span className="shrink-0 text-sub">{it.icon}</span>}
              <span className="flex-1 text-[14px] font-semibold">{it.label}</span>
              <ChevronDown
                size={17}
                className={cn("shrink-0 text-sub transition-transform duration-200", isOpen && "rotate-180")}
              />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="px-4 pb-4 pt-0 text-[13.5px] leading-relaxed text-sub">
                  {it.content}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
