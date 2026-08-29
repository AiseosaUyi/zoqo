"use client";
import * as React from "react";
import { Button, SegmentedControl } from "@/components/ui";
import { ASSET_BY_ID } from "@/lib/assets";
import { usd, price as formatPrice } from "@/lib/format";
import { MAX_POSITION_PCT, MAX_RISK_PCT } from "@/lib/terminalStore";

const MIN_SL_TP_PCT = 0.1;
const MAX_SL_TP_PCT = 50;
const clampPct = (v: number) => Math.min(MAX_SL_TP_PCT, Math.max(MIN_SL_TP_PCT, v || MIN_SL_TP_PCT));

export function OrderTicket({
  assetId,
  price,
  cash,
  onSubmit,
  initialSide = "long",
}: {
  assetId: string;
  price: number | null;
  cash: number;
  onSubmit: (side: "long" | "short", qty: number, stopLoss?: number, takeProfit?: number) => boolean;
  /** Pre-selects a side — used by MobileTerminalBar, whose Long/Short
   *  buttons should open the sheet already on the tapped side rather than
   *  always defaulting to long. */
  initialSide?: "long" | "short";
}) {
  const asset = ASSET_BY_ID[assetId];
  const decimals = asset?.decimals ?? 2;
  const [side, setSide] = React.useState<"long" | "short">(initialSide);
  const [amountUsd, setAmountUsd] = React.useState(100);
  const [useSlTp, setUseSlTp] = React.useState(false);
  const [slPct, setSlPct] = React.useState(2);
  const [tpPct, setTpPct] = React.useState(4);
  const [error, setError] = React.useState<string | null>(null);

  const qty = price ? amountUsd / price : 0;
  const insufficientFunds = amountUsd > cash;
  const oversized = amountUsd > cash * MAX_POSITION_PCT;
  const slPrice = price ? price * (side === "long" ? 1 - slPct / 100 : 1 + slPct / 100) : null;
  const tpPrice = price ? price * (side === "long" ? 1 + tpPct / 100 : 1 - tpPct / 100) : null;
  const riskAmount = useSlTp && slPrice != null ? Math.abs((price ?? 0) - slPrice) * qty : 0;
  const overRisk = useSlTp && riskAmount > cash * MAX_RISK_PCT;

  const submit = () => {
    if (!price) return;
    const sl = useSlTp ? (slPrice ?? undefined) : undefined;
    const tp = useSlTp ? (tpPrice ?? undefined) : undefined;
    const ok = onSubmit(side, qty, sl, tp);
    setError(ok ? null : "That order was rejected — check size and stop-loss risk against the limits below.");
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-bold text-sub">{asset?.symbol ?? assetId}</span>
        <span className="nums text-[15px] font-bold text-ink">
          {price != null ? formatPrice(price, decimals) : <span className="text-[11px] font-medium text-sub">Connecting…</span>}
        </span>
      </div>

      <SegmentedControl
        value={side}
        onChange={(v) => setSide(v as "long" | "short")}
        data={[
          { value: "long", label: "Buy / Long" },
          { value: "short", label: "Sell / Short" },
        ]}
        color={side === "long" ? "up" : "down"}
        fullWidth
        size="md"
      />

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-sub">Amount (USD)</span>
        <input
          type="number"
          min={1}
          value={amountUsd}
          onChange={(e) => setAmountUsd(Math.max(0, Number(e.target.value)))}
          className="h-10 rounded-chip border border-line px-3 text-[14px] font-bold nums outline-none focus:border-purple-400"
        />
      </label>

      <div className="flex gap-1.5">
        {[50, 100, 250, 500].map((v) => (
          <button
            key={v}
            onClick={() => setAmountUsd(v)}
            className="flex-1 rounded-chip bg-muted px-2 py-1.5 text-[12px] font-semibold text-sub hover:bg-gray-200"
          >
            ${v}
          </button>
        ))}
      </div>

      <button
        onClick={() => setUseSlTp((v) => !v)}
        className="text-left text-[12px] font-semibold text-purple-600"
      >
        {useSlTp ? "− Remove" : "+ Add"} stop-loss / take-profit
      </button>

      {useSlTp && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-sub">Stop-loss %</span>
            <input
              type="number"
              min={MIN_SL_TP_PCT}
              max={MAX_SL_TP_PCT}
              step={0.1}
              value={slPct}
              onChange={(e) => setSlPct(Number(e.target.value))}
              onBlur={() => setSlPct((v) => clampPct(v))}
              className="h-9 rounded-chip border border-line px-2 text-[13px] nums outline-none"
            />
            <span className="text-[10px] text-sub nums">{slPrice != null ? `@ ${formatPrice(slPrice, decimals)}` : "—"}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-sub">Take-profit %</span>
            <input
              type="number"
              min={MIN_SL_TP_PCT}
              max={MAX_SL_TP_PCT}
              step={0.1}
              value={tpPct}
              onChange={(e) => setTpPct(Number(e.target.value))}
              onBlur={() => setTpPct((v) => clampPct(v))}
              className="h-9 rounded-chip border border-line px-2 text-[13px] nums outline-none"
            />
            <span className="text-[10px] text-sub nums">{tpPrice != null ? `@ ${formatPrice(tpPrice, decimals)}` : "—"}</span>
          </label>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1.5 border-t border-line pt-3">
        <div className="flex justify-between text-[11px] text-sub">
          <span>Qty</span>
          <span className="nums">{qty ? qty.toFixed(6) : "—"}</span>
        </div>
        <div className="flex justify-between text-[11px] text-sub">
          <span>Available</span>
          <span className={`nums ${insufficientFunds ? "font-semibold text-red-600" : ""}`}>{usd(cash)}</span>
        </div>
        {insufficientFunds ? (
          <div className="text-[11px] font-semibold text-red-600">Exceeds available cash.</div>
        ) : oversized ? (
          <div className="text-[11px] font-semibold text-red-600">
            Size exceeds {Math.round(MAX_POSITION_PCT * 100)}% of cash — max {usd(cash * MAX_POSITION_PCT)}.
          </div>
        ) : overRisk ? (
          <div className="text-[11px] font-semibold text-red-600">
            Stop-loss risks {usd(riskAmount)}, over {Math.round(MAX_RISK_PCT * 100)}% of cash — tighten the stop or size.
          </div>
        ) : !price ? (
          <div className="text-[11px] text-sub">Waiting for a live price…</div>
        ) : (
          error && <div className="text-[11px] font-semibold text-red-600">{error}</div>
        )}
        <Button
          color={side === "long" ? "up" : "down"}
          size="lg"
          fullWidth
          disabled={!price || amountUsd <= 0 || insufficientFunds || oversized || overRisk}
          onClick={submit}
        >
          {side === "long" ? "Buy" : "Sell"} {asset?.symbol ?? ""}
        </Button>
      </div>
    </div>
  );
}
