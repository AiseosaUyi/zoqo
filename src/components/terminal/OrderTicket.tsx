"use client";
import * as React from "react";
import { Button, SegmentedControl } from "@/components/ui";
import { ASSET_BY_ID } from "@/lib/assets";
import { usd } from "@/lib/format";

export function OrderTicket({
  assetId,
  price,
  cash,
  onSubmit,
}: {
  assetId: string;
  price: number | null;
  cash: number;
  onSubmit: (side: "long" | "short", qty: number, stopLoss?: number, takeProfit?: number) => boolean;
}) {
  const asset = ASSET_BY_ID[assetId];
  const [side, setSide] = React.useState<"long" | "short">("long");
  const [amountUsd, setAmountUsd] = React.useState(100);
  const [useSlTp, setUseSlTp] = React.useState(false);
  const [slPct, setSlPct] = React.useState(2);
  const [tpPct, setTpPct] = React.useState(4);
  const [error, setError] = React.useState<string | null>(null);

  const qty = price ? amountUsd / price : 0;

  const submit = () => {
    if (!price) return;
    const sl = useSlTp ? price * (side === "long" ? 1 - slPct / 100 : 1 + slPct / 100) : undefined;
    const tp = useSlTp ? price * (side === "long" ? 1 + tpPct / 100 : 1 - tpPct / 100) : undefined;
    const ok = onSubmit(side, qty, sl, tp);
    setError(ok ? null : "Not enough paper cash for that size.");
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="text-[12px] font-bold text-sub">{asset?.symbol ?? assetId}</div>

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
              value={slPct}
              onChange={(e) => setSlPct(Number(e.target.value))}
              className="h-9 rounded-chip border border-line px-2 text-[13px] nums outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-sub">Take-profit %</span>
            <input
              type="number"
              value={tpPct}
              onChange={(e) => setTpPct(Number(e.target.value))}
              className="h-9 rounded-chip border border-line px-2 text-[13px] nums outline-none"
            />
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
          <span className="nums">{usd(cash)}</span>
        </div>
        {error && <div className="text-[11px] font-semibold text-red-600">{error}</div>}
        <Button
          color={side === "long" ? "up" : "down"}
          size="lg"
          fullWidth
          disabled={!price || amountUsd <= 0}
          onClick={submit}
        >
          {side === "long" ? "Buy" : "Sell"} {asset?.symbol ?? ""}
        </Button>
      </div>
    </div>
  );
}
