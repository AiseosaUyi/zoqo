"use client";
import * as React from "react";
import { LayoutGrid } from "lucide-react";

/** Restores panels closed via a PanelFrame's X button — hidden entirely
 *  when nothing is closed, so it never sits around as dead chrome. */
export function PanelsMenu({
  panels,
  hidden,
  onShow,
}: {
  panels: { id: string; label: string }[];
  hidden: string[];
  onShow: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

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

  if (hidden.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-chip border border-line px-2.5 py-1 text-[11.5px] font-semibold text-sub transition-colors hover:text-ink"
      >
        <LayoutGrid size={13} />
        Panels ({hidden.length} hidden)
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-52 rounded-[12px] border border-line bg-surface p-1 shadow-e2">
          {panels
            .filter((p) => hidden.includes(p.id))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onShow(p.id)}
                className="flex w-full items-center justify-between rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px] text-ink hover:bg-muted"
              >
                {p.label}
                <span className="text-[11px] font-semibold text-purple-600">Show</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
