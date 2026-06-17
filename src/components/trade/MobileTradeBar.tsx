"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import { TradeCard } from "./TradeCard";
import { SettlementPanel } from "./SettlementPanel";
import { cents } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { Side } from "@/lib/types";

/** Phone-only (<lg) trading surface: a thumb-reach Up/Down bar pinned to the
 *  bottom that opens a slide-up sheet hosting the full TradeCard. */
export function MobileTradeBar({
  marketId,
  side,
  onSideChange,
}: {
  marketId: string;
  side: Side;
  onSideChange: (s: Side) => void;
}) {
  const { quote, getMarket } = useZoqo();
  const [open, setOpen] = React.useState(false);
  const q = quote(marketId);
  const m = getMarket(marketId);
  const settled = m?.status === "settled";

  const openWith = (s: Side) => {
    onSideChange(s);
    setOpen(true);
  };

  return (
    <>
      {/* sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface/95 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-md lg:hidden">
        <div className="mx-auto max-w-[1440px]">
          {settled ? (
            <button
              onClick={() => setOpen(true)}
              className="w-full rounded-[12px] border bg-surface py-3 text-[14px] font-bold text-ink transition-colors active:bg-gray-50"
            >
              Round settled — view result
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <BarButton
                color="up"
                label="Buy Up"
                price={q.yes}
                icon={<TrendingUp size={16} />}
                onClick={() => openWith("up")}
              />
              <BarButton
                color="down"
                label="Buy Down"
                price={q.no}
                icon={<TrendingDown size={16} />}
                onClick={() => openWith("down")}
              />
            </div>
          )}
        </div>
      </div>

      {open && (
        <TradeSheet
          marketId={marketId}
          side={side}
          settled={settled}
          onSideChange={onSideChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function BarButton({
  color,
  label,
  price,
  icon,
  disabled,
  onClick,
}: {
  color: "up" | "down";
  label: string;
  price: number;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  const up = color === "up";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-2 rounded-[12px] py-3 text-white transition-colors disabled:opacity-50",
        up ? "bg-green-500 active:bg-green-600" : "bg-red-500 active:bg-red-600",
      )}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide">
        {icon} {label}
      </span>
      <span className="text-[17px] font-black leading-none nums">{cents(price)}</span>
    </button>
  );
}

function TradeSheet({
  marketId,
  side,
  settled,
  onSideChange,
  onClose,
}: {
  marketId: string;
  side: Side;
  settled?: boolean;
  onSideChange: (s: Side) => void;
  onClose: () => void;
}) {
  const { getMarket } = useZoqo();
  const m = getMarket(marketId);
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true">
      <div className="fade-in absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="sheet-up relative max-h-[88vh] overflow-y-auto rounded-t-[20px] border-t bg-bg pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-16px_48px_rgba(14,17,19,0.22)]">
        {/* grab handle + header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-bg/95 px-4 pb-3 pt-2 backdrop-blur-md">
          <div className="absolute inset-x-0 top-1.5 mx-auto h-1 w-9 rounded-full bg-line" />
          <div className="pt-1.5">
            <h2 className="font-display text-[16px] font-black leading-none text-ink">
              {settled ? "Result" : "Trade"}
            </h2>
            <p className="mt-1 text-[11px] text-sub nums">
              {m?.label ?? "BTC"} · Target {m?.strike?.toLocaleString() ?? "—"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="mt-1 grid h-8 w-8 place-items-center rounded-full hover:bg-gray-100"
          >
            <X size={18} className="text-sub" />
          </button>
        </div>
        <div className="p-4">
          {settled ? (
            <SettlementPanel marketId={marketId} />
          ) : (
            <TradeCard marketId={marketId} side={side} onSideChange={onSideChange} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
