"use client";
import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { usd, price as formatPrice } from "@/lib/format";
import { MAX_POSITION_PCT } from "@/lib/terminalStore";
import type { StylePanelPosition } from "./DrawingStylePanel";

/** Floating panel for a drawn Long/Short position annotation — same
 *  anchored/edge-aware-flip pattern as DrawingStylePanel, shown instead of it
 *  for these two drawing types since a risk/reward box needs an order-entry
 *  UI, not a stroke/fill editor. Entry/stop/target come straight off the
 *  drawing's own anchors (lightweight-charts-drawing's LongPosition/
 *  ShortPosition already compute them via getPositionInfo()) — this panel
 *  only adds the one thing the drawing itself has no concept of: size. */
const PANEL_WIDTH = 224;
const PANEL_HEIGHT = 250;
const PANEL_MARGIN = 10;
const QUICK_AMOUNTS = [50, 100, 250, 500];

export function PositionOrderPanel({
  side,
  entry,
  stopLoss,
  takeProfit,
  decimals,
  cash,
  position,
  status,
  onPlace,
  onCancelOrder,
  onDiscard,
  onClose,
}: {
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  decimals: number;
  cash: number;
  position: StylePanelPosition;
  /** "draft" = just drawn, not yet an order. "pending" = a real resting
   *  Limit order is tracking this box. "filled" = that order already
   *  executed (it's a live position now, tracked in Positions, not here). */
  status: "draft" | "pending" | "filled";
  onPlace: (qty: number) => void;
  onCancelOrder: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const [amountUsd, setAmountUsd] = React.useState(100);
  const { x, y, containerWidth, containerHeight } = position;

  const flipUp = y + PANEL_MARGIN + PANEL_HEIGHT > containerHeight;
  const top = flipUp ? Math.max(PANEL_MARGIN, y - PANEL_HEIGHT - PANEL_MARGIN) : y + PANEL_MARGIN;
  const left = Math.min(
    Math.max(PANEL_MARGIN, x - PANEL_WIDTH / 2),
    Math.max(PANEL_MARGIN, containerWidth - PANEL_WIDTH - PANEL_MARGIN),
  );

  const qty = entry > 0 ? amountUsd / entry : 0;
  const maxSpend = cash * MAX_POSITION_PCT;
  const oversized = amountUsd > maxSpend;

  return (
    <div
      className="absolute z-20 flex flex-col gap-2.5 rounded-chip border border-line bg-surface p-2.5 shadow-e3"
      style={{ left, top, width: PANEL_WIDTH }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-sub">{side === "long" ? "Long" : "Short"} Position</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-6 w-6 place-items-center rounded-chip text-sub transition-colors hover:bg-gray-50 hover:text-ink"
        >
          <X size={13} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-y-1 text-[11px]">
        <span className="text-sub">Entry</span>
        <span className="nums text-right font-semibold text-ink">{formatPrice(entry, decimals)}</span>
        <span className="text-sub">Stop</span>
        <span className="nums text-right font-semibold text-red-600">{formatPrice(stopLoss, decimals)}</span>
        <span className="text-sub">Target</span>
        <span className="nums text-right font-semibold text-green-600">{formatPrice(takeProfit, decimals)}</span>
      </div>

      {status === "draft" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-sub">Amount (USD)</span>
            <input
              type="number"
              min={1}
              value={amountUsd}
              onChange={(e) => setAmountUsd(Math.max(0, Number(e.target.value)))}
              className="h-9 rounded-chip border border-line px-2 text-[13px] font-bold nums outline-none focus:border-purple-400"
            />
          </label>
          <div className="flex gap-1">
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmountUsd(v)}
                className="flex-1 rounded-chip bg-muted px-1.5 py-1 text-[11px] font-semibold text-sub hover:bg-gray-200"
              >
                ${v}
              </button>
            ))}
          </div>
          {oversized && (
            <div className="text-[10.5px] font-semibold text-red-600">
              Exceeds {Math.round(MAX_POSITION_PCT * 100)}% of cash — max {usd(maxSpend)}.
            </div>
          )}
          <div className="flex gap-1.5">
            <Button color="gray" size="sm" fullWidth onClick={onDiscard}>
              Discard
            </Button>
            <Button
              color={side === "long" ? "up" : "down"}
              size="sm"
              fullWidth
              disabled={amountUsd <= 0 || oversized}
              onClick={() => onPlace(qty)}
            >
              Place {side === "long" ? "Buy" : "Sell"}
            </Button>
          </div>
        </>
      )}

      {status === "pending" && (
        <>
          <div className="text-[11px] text-sub">
            Tracked live — fills at {formatPrice(entry, decimals)} or better, then auto-closes at the stop or
            target.
          </div>
          <Button color="gray" size="sm" fullWidth onClick={onCancelOrder}>
            Cancel Order
          </Button>
        </>
      )}

      {status === "filled" && (
        <div className="text-[11px] font-semibold text-green-600">Filled — now a live position.</div>
      )}
    </div>
  );
}
