"use client";
import * as React from "react";
import { TradeCard } from "./TradeCard";
import { SettlementPanel } from "./SettlementPanel";
import { MarketDepth } from "./MarketDepth";
import { useZoqo } from "@/lib/store";
import type { Side } from "@/lib/types";

export function RightRail({
  marketId,
  side,
  onSideChange,
}: {
  marketId: string;
  side?: Side;
  onSideChange?: (s: Side) => void;
}) {
  const { getMarket } = useZoqo();
  const settled = getMarket(marketId)?.status === "settled";
  return (
    <div className="flex h-full">
      {/* Order book sits beside the trade panel, not stacked above/below it
          (Figma: chart | order book | trade panel, three side-by-side
          columns). Once a market settles there's nothing left to trade
          against, so the order book column drops out and the result card
          gets the full remaining width — matches the Figma settled state. */}
      {!settled && (
        <div className="w-[260px] shrink-0 border-r p-4">
          <MarketDepth marketId={marketId} />
        </div>
      )}
      <div className="min-w-0 flex-1 p-4">
        {settled ? (
          <SettlementPanel marketId={marketId} />
        ) : (
          <TradeCard marketId={marketId} side={side} onSideChange={onSideChange} />
        )}
      </div>
    </div>
  );
}
