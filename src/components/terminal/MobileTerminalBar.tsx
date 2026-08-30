"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import { ASSET_BY_ID } from "@/lib/assets";
import { price as formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import { OrderTicket, type SubmitOrderOptions } from "./OrderTicket";

/** Reservation for this bar's own ~64px (py-2.5 top+bottom + the button
 *  row) plus its safe-area inset, so TerminalShell's chart/positions column
 *  doesn't end up hidden underneath it. There's no bottom tab nav to stack
 *  above anymore (removed — trading screens need the vertical space more
 *  than persistent nav chrome does; the header's hamburger is the only
 *  mobile nav now), so this bar docks flush at the true screen edge. */
export const MOBILE_TERMINAL_CONTENT_SAFE_PADDING = "pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0";

/** Phone-only trading surface for the Terminal — the same sticky-bar +
 *  slide-up-sheet shape `src/components/trade/MobileTradeBar.tsx` already
 *  established for the prediction market, generalized to the terminal's
 *  long/short order ticket instead of TradeCard. Docks at the screen's true
 *  bottom edge (its own safe-area-inset-bottom padding handles the notch). */
export function MobileTerminalBar({
  assetId,
  price,
  cash,
  onSubmit,
}: {
  assetId: string;
  price: number | null;
  cash: number;
  onSubmit: (side: "long" | "short", qty: number, opts?: SubmitOrderOptions) => boolean;
}) {
  const asset = ASSET_BY_ID[assetId];
  const decimals = asset?.decimals ?? 2;
  const [open, setOpen] = React.useState(false);
  const [side, setSide] = React.useState<"long" | "short">("long");

  const openWith = (s: "long" | "short") => {
    setSide(s);
    setOpen(true);
  };

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface/95 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-2">
          <BarButton
            color="up"
            label="Long"
            price={price}
            decimals={decimals}
            icon={<TrendingUp size={16} />}
            onClick={() => openWith("long")}
          />
          <BarButton
            color="down"
            label="Short"
            price={price}
            decimals={decimals}
            icon={<TrendingDown size={16} />}
            onClick={() => openWith("short")}
          />
        </div>
      </div>

      {open && (
        <TerminalSheet
          assetId={assetId}
          side={side}
          price={price}
          cash={cash}
          onSubmit={(s, qty, opts) => {
            const ok = onSubmit(s, qty, opts);
            if (ok) setOpen(false);
            return ok;
          }}
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
  decimals,
  icon,
  onClick,
}: {
  color: "up" | "down";
  label: string;
  price: number | null;
  decimals: number;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const up = color === "up";
  return (
    <button
      onClick={onClick}
      disabled={price == null}
      className={cn(
        "flex items-center justify-center gap-2 rounded-full py-3 text-white transition-colors disabled:opacity-50",
        up ? "bg-green-500 active:bg-green-600" : "bg-red-500 active:bg-red-600",
      )}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide">
        {icon} {label}
      </span>
      <span className="text-[15px] font-black leading-none nums">
        {price != null ? formatPrice(price, decimals) : "—"}
      </span>
    </button>
  );
}

function TerminalSheet({
  assetId,
  side,
  price,
  cash,
  onSubmit,
  onClose,
}: {
  assetId: string;
  side: "long" | "short";
  price: number | null;
  cash: number;
  onSubmit: (side: "long" | "short", qty: number, opts?: SubmitOrderOptions) => boolean;
  onClose: () => void;
}) {
  const asset = ASSET_BY_ID[assetId];
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true">
      <div className="fade-in absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="sheet-up relative max-h-[88vh] overflow-y-auto rounded-t-[20px] border-t bg-bg pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-16px_48px_rgba(14,17,19,0.22)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-bg/95 px-4 pb-3 pt-2 backdrop-blur-md">
          <div className="absolute inset-x-0 top-1.5 mx-auto h-1 w-9 rounded-full bg-line" />
          <div className="pt-1.5">
            <h2 className="font-display text-[16px] font-black leading-none text-ink">
              {side === "long" ? "Buy / Long" : "Sell / Short"}
            </h2>
            <p className="mt-1 text-[11px] text-sub">{asset?.symbol ?? assetId}</p>
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
          <OrderTicket assetId={assetId} price={price} cash={cash} onSubmit={onSubmit} initialSide={side} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
