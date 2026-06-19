"use client";
import * as React from "react";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { signedUsd, usd } from "@/lib/format";
import { useZoqo, type SettlementResult } from "@/lib/store";

const AUTO_DISMISS_MS = 7000;

export function SettlementToast() {
  const { settlements, dismissSettlement } = useZoqo();

  // Auto-dismiss the oldest toast after a delay
  React.useEffect(() => {
    if (settlements.length === 0) return;
    const id = setTimeout(() => dismissSettlement(settlements[0].id), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [settlements, dismissSettlement]);

  if (settlements.length === 0) return null;

  return (
    // Stack of toasts, newest on top; fixed above mobile trade bar (bottom-20) on small screens
    <div className="fixed bottom-24 right-3 z-50 flex w-72 flex-col gap-2 lg:bottom-5 lg:right-5">
      {settlements.slice(0, 3).map((s) => (
        <Toast key={s.id} s={s} onDismiss={dismissSettlement} />
      ))}
    </div>
  );
}

function Toast({ s, onDismiss }: { s: SettlementResult; onDismiss: (id: string) => void }) {
  const won = s.won;
  const Icon = s.side === "up" ? TrendingUp : TrendingDown;

  return (
    <div
      className={cn(
        "animate-in slide-in-from-right-4 fade-in rounded-[16px] border p-4 shadow-e4 duration-300",
        won ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            won ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600",
          )}
        >
          <Icon size={18} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-sub">
            {won ? "You won" : "You lost"} · BTC {s.marketLabel}
          </p>
          <p
            className={cn(
              "font-display text-[28px] font-black leading-tight nums",
              won ? "text-green-600" : "text-red-600",
            )}
          >
            {signedUsd(s.pnl)}
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-black/5 pt-1.5 text-[11px]">
            <span className="text-sub">Staked</span>
            <span className="text-right font-semibold text-ink nums">{usd(s.cost)}</span>
            <span className="text-sub">Payout</span>
            <span className="text-right font-semibold text-ink nums">{usd(s.payout)}</span>
            <span className="text-sub">BTC closed</span>
            <span className="text-right font-semibold text-ink nums">
              ${s.closePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-sub">Strike</span>
            <span className="text-right font-semibold text-ink nums">
              ${s.strike.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => onDismiss(s.id)}
          className="shrink-0 rounded-full p-1 text-sub hover:bg-black/5"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
