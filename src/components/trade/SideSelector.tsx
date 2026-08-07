"use client";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { cents } from "@/lib/format";
import type { Side } from "@/lib/types";

/** Shared Up/Down picker — used by both TradeCard (single market, shows live
 *  price per side) and BulkTradePanel (spans multiple markets, no single
 *  price to show). Previously each panel hand-rolled its own version of this
 *  control with a different visual language; this is the one true look. */
export function SideSelector({
  side,
  onChange,
  prices,
}: {
  side: Side;
  onChange: (s: Side) => void;
  /** live cents price per side — omit when no single market price applies */
  prices?: { up: number; down: number };
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <SideButton
        active={side === "up"}
        color="up"
        label="Up"
        price={prices?.up}
        icon={<TrendingUp size={15} />}
        onClick={() => onChange("up")}
      />
      <SideButton
        active={side === "down"}
        color="down"
        label="Down"
        price={prices?.down}
        icon={<TrendingDown size={15} />}
        onClick={() => onChange("down")}
      />
    </div>
  );
}

function SideButton({
  active,
  color,
  label,
  price,
  icon,
  onClick,
}: {
  active: boolean;
  color: "up" | "down";
  label: string;
  price?: number;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const up = color === "up";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-[12px] border-2 px-3 py-2.5 transition-all",
        active
          ? up
            ? "border-green-500 bg-green-500 text-white"
            : "border-red-500 bg-red-500 text-white"
          : up
            ? "border-line bg-surface text-green-600 hover:border-green-300"
            : "border-line bg-surface text-red-600 hover:border-red-300",
      )}
    >
      <span className="flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide">
        {icon} {label}
      </span>
      {price != null && <span className="text-[20px] font-black leading-none nums">{cents(price)}</span>}
    </button>
  );
}
