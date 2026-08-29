"use client";
import * as React from "react";
import { ASSETS } from "@/lib/assets";
import { usd } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Phone-only symbol switcher — a horizontally swipeable strip of chips
 *  (native scroll-snap, not a hand-rolled touch-gesture carousel: it gives
 *  the same "swipe between symbols" feel Binance/Robinhood's mobile apps
 *  have with none of the custom gesture-handling risk) replacing the old
 *  plain `<select>` dropdown (TERMINAL_SPEC.md §5 — "a swipeable horizontal
 *  carousel, not a dropdown"). Scrolls the active chip into view on
 *  mount/asset-change so switching from the desktop watchlist (or a Mock
 *  Trade lesson's deep-link) keeps this in sync. */
export function MobileAssetCarousel({
  activeId,
  onSelect,
  prices,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  prices: Record<string, { price: number | null; synthetic: boolean }>;
}) {
  const activeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeId]);

  return (
    <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ASSETS.map((a) => {
        const active = a.id === activeId;
        const live = prices[a.id];
        return (
          <button
            key={a.id}
            ref={active ? activeRef : undefined}
            onClick={() => onSelect(a.id)}
            className={cn(
              "flex shrink-0 snap-center flex-col items-start gap-0.5 rounded-chip border px-3 py-1.5 text-left",
              active ? "border-purple-300 bg-purple-50" : "border-line bg-surface",
            )}
          >
            <span className={cn("text-[12px] font-bold", active ? "text-purple-700" : "text-ink")}>
              {a.symbol}
            </span>
            <span className="nums text-[11px] text-sub">
              {live?.price ? usd(live.price, { maximumFractionDigits: a.decimals >= 4 ? 4 : 2 }) : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
