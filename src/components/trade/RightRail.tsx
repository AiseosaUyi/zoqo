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
    <div className="flex flex-col">
      <div className="p-4">
        {settled ? (
          <SettlementPanel marketId={marketId} />
        ) : (
          <TradeCard marketId={marketId} side={side} onSideChange={onSideChange} />
        )}
      </div>
      <div className="border-t p-4">
        <MarketDepth marketId={marketId} />
      </div>
    </div>
  );
}
