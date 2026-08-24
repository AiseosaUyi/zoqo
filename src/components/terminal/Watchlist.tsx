"use client";
import * as React from "react";
import { ASSETS, assetClassLabel, type AssetClass, type AssetDef } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";

const CLASSES: AssetClass[] = ["crypto", "gold", "forex"];

type LivePrice = { price: number | null; synthetic: boolean };

export function Watchlist({
  activeId,
  onSelect,
  prices,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  prices: Record<string, LivePrice>;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {CLASSES.map((cls) => (
        <div key={cls} className="px-3 pt-3">
          <div className="px-1 pb-1.5 text-[11px] font-bold tracking-wide text-sub uppercase">
            {assetClassLabel(cls)}
          </div>
          <div className="flex flex-col gap-0.5">
            {ASSETS.filter((a) => a.assetClass === cls).map((a) => (
              <WatchlistRow
                key={a.id}
                asset={a}
                active={a.id === activeId}
                live={prices[a.id]}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WatchlistRow({
  asset,
  active,
  live,
  onSelect,
}: {
  asset: AssetDef;
  active: boolean;
  live: LivePrice | undefined;
  onSelect: (id: string) => void;
}) {
  // Trading watchlists always signal tick direction, not just the new
  // number — otherwise every price update reads identically whether the
  // market just spiked or crept. A brief background flash on the row is the
  // standard affordance (Binance/Robinhood/MT5 all do this); prevPriceRef
  // tracks the last-seen price purely to detect direction, not for display.
  const prevPriceRef = React.useRef<number | null>(null);
  const [flash, setFlash] = React.useState<"up" | "down" | null>(null);

  React.useEffect(() => {
    const p = live?.price;
    if (p == null) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = p;
    if (prev == null || p === prev) return;
    setFlash(p > prev ? "up" : "down");
    const t = setTimeout(() => setFlash(null), 450);
    return () => clearTimeout(t);
  }, [live?.price]);

  return (
    <button
      onClick={() => onSelect(asset.id)}
      className={cn(
        "flex items-center justify-between rounded-chip px-2.5 py-2 text-left transition-colors duration-300",
        active ? "bg-purple-50" : flash === "up" ? "bg-green-50" : flash === "down" ? "bg-red-50" : "hover:bg-gray-50",
      )}
    >
      <div className="flex flex-col">
        <span className={cn("text-[13px] font-semibold", active ? "text-purple-700" : "text-ink")}>
          {asset.symbol}
        </span>
        <span className="text-[11px] text-sub">{asset.label}</span>
      </div>
      <div className="flex flex-col items-end">
        <span
          className={cn(
            "nums text-[13px] font-bold transition-colors duration-300",
            flash === "up" ? "text-green-600" : flash === "down" ? "text-red-600" : "text-ink",
          )}
        >
          {live?.price ? usd(live.price, { minimumFractionDigits: asset.decimals, maximumFractionDigits: asset.decimals }) : "—"}
        </span>
        {live?.synthetic && <span className="text-[10px] text-gold-700">sim</span>}
      </div>
    </button>
  );
}
