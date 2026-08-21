"use client";
import { ASSETS, assetClassLabel, type AssetClass } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";

const CLASSES: AssetClass[] = ["crypto", "gold", "forex"];

export function Watchlist({
  activeId,
  onSelect,
  prices,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  prices: Record<string, { price: number | null; synthetic: boolean }>;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {CLASSES.map((cls) => (
        <div key={cls} className="px-3 pt-3">
          <div className="px-1 pb-1.5 text-[11px] font-bold tracking-wide text-sub uppercase">
            {assetClassLabel(cls)}
          </div>
          <div className="flex flex-col gap-0.5">
            {ASSETS.filter((a) => a.assetClass === cls).map((a) => {
              const live = prices[a.id];
              const active = a.id === activeId;
              return (
                <button
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  className={cn(
                    "flex items-center justify-between rounded-chip px-2.5 py-2 text-left transition-colors",
                    active ? "bg-purple-50" : "hover:bg-gray-50",
                  )}
                >
                  <div className="flex flex-col">
                    <span className={cn("text-[13px] font-semibold", active ? "text-purple-700" : "text-ink")}>
                      {a.symbol}
                    </span>
                    <span className="text-[11px] text-sub">{a.label}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="nums text-[13px] font-bold text-ink">
                      {live?.price ? usd(live.price, { maximumFractionDigits: a.decimals >= 4 ? 4 : 2 }) : "—"}
                    </span>
                    {live?.synthetic && <span className="text-[10px] text-gold-700">sim</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
