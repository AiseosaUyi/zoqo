"use client";
import * as React from "react";
import { Button, Checkbox, LiveDot, SegmentedControl, Slider } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ASSET_BY_ID } from "@/lib/assets";
import { usd, price as formatPrice } from "@/lib/format";
import { MAX_POSITION_PCT, MAX_RISK_PCT } from "@/lib/terminalStore";

const MIN_SL_TP_PCT = 0.1;
const MAX_SL_TP_PCT = 50;
const clampPct = (v: number) => Math.min(MAX_SL_TP_PCT, Math.max(MIN_SL_TP_PCT, v || MIN_SL_TP_PCT));

export interface SubmitOrderOptions {
  stopLoss?: number;
  takeProfit?: number;
  /** Defaults to a market fill when omitted. */
  orderType?: "market" | "limit";
  limitPrice?: number;
  reduceOnly?: boolean;
}

export function OrderTicket({
  assetId,
  price,
  cash,
  onSubmit,
  initialSide = "long",
  source,
  connected,
}: {
  assetId: string;
  price: number | null;
  cash: number;
  onSubmit: (side: "long" | "short", qty: number, opts?: SubmitOrderOptions) => boolean;
  /** Pre-selects a side — used by MobileTerminalBar, whose Long/Short
   *  buttons should open the sheet already on the tapped side rather than
   *  always defaulting to long. */
  initialSide?: "long" | "short";
  /** Feed status from useAssetPrice — optional since MobileTerminalBar's
   *  sheet doesn't thread it through yet; the price digits' own tick-flash
   *  still works without it. */
  source?: string;
  connected?: boolean;
}) {
  const asset = ASSET_BY_ID[assetId];
  const decimals = asset?.decimals ?? 2;
  const [side, setSide] = React.useState<"long" | "short">(initialSide);
  const [orderType, setOrderType] = React.useState<"market" | "limit">("market");
  const [amountUsd, setAmountUsd] = React.useState(100);
  const [limitPrice, setLimitPrice] = React.useState<number | null>(null);
  const [reduceOnly, setReduceOnly] = React.useState(false);
  const [useSlTp, setUseSlTp] = React.useState(false);
  const [slPct, setSlPct] = React.useState(2);
  const [tpPct, setTpPct] = React.useState(4);
  const [error, setError] = React.useState<string | null>(null);

  // React's "adjust state during render" pattern (see TerminalShell's
  // appliedMockLessonParam for the same shape) — seed the limit price from
  // the live mark the first time the trader switches into Limit mode,
  // rather than leaving the input blank or stale from a previous asset.
  const [seededOrderType, setSeededOrderType] = React.useState(orderType);
  if (orderType !== seededOrderType) {
    setSeededOrderType(orderType);
    if (orderType === "limit" && limitPrice == null && price != null) setLimitPrice(price);
  }

  // A limit price carried over from a different asset (e.g. BTC's ~78,000)
  // would be nonsense on EUR/USD — clear it on asset switch.
  const [seededAssetId, setSeededAssetId] = React.useState(assetId);
  if (assetId !== seededAssetId) {
    setSeededAssetId(assetId);
    setLimitPrice(null);
  }

  const effectivePrice = orderType === "limit" ? limitPrice : price;
  const qty = effectivePrice ? amountUsd / effectivePrice : 0;
  const maxSpend = cash * MAX_POSITION_PCT;
  const insufficientFunds = amountUsd > cash;
  const oversized = amountUsd > maxSpend;
  const slPrice = effectivePrice ? effectivePrice * (side === "long" ? 1 - slPct / 100 : 1 + slPct / 100) : null;
  const tpPrice = effectivePrice ? effectivePrice * (side === "long" ? 1 + tpPct / 100 : 1 - tpPct / 100) : null;
  const riskAmount = useSlTp && slPrice != null ? Math.abs((effectivePrice ?? 0) - slPrice) * qty : 0;
  const overRisk = useSlTp && riskAmount > cash * MAX_RISK_PCT;

  // Same tick-direction flash Watchlist rows use — this is the single
  // number a trader stares at most on this screen, and it was the one price
  // display in the terminal with zero liveliness cue: real ticks were
  // landing (confirmed via /api/crypto/[symbol] and /api/btc/price both
  // returning fresh prices on every poll), it just silently swapped digits
  // with no visual signal that anything had happened.
  const prevPriceRef = React.useRef<number | null>(null);
  const [flash, setFlash] = React.useState<"up" | "down" | null>(null);
  React.useEffect(() => {
    if (price == null) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = price;
    if (prev == null || price === prev) return;
    setFlash(price > prev ? "up" : "down");
    const t = setTimeout(() => setFlash(null), 450);
    return () => clearTimeout(t);
  }, [price]);

  const submit = () => {
    if (orderType === "limit" ? !limitPrice : !price) return;
    const sl = useSlTp ? (slPrice ?? undefined) : undefined;
    const tp = useSlTp ? (tpPrice ?? undefined) : undefined;
    const ok = onSubmit(side, qty, {
      stopLoss: sl,
      takeProfit: tp,
      orderType,
      limitPrice: orderType === "limit" ? (limitPrice ?? undefined) : undefined,
      reduceOnly,
    });
    setError(
      ok
        ? null
        : reduceOnly
          ? "Nothing to reduce — you don't have an opposite-side position on this asset."
          : "That order was rejected — check size and stop-loss risk against the limits below.",
    );
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* A fixed-height Panel (react-resizable-panels) can end up shorter
          than this form's natural content once Limit/Reduce-Only/slider
          fields are all showing — without shrink-0 here, flexbox would
          compress percentage-sized children (SegmentedControl's h-full
          buttons) toward 0 trying to fit instead of letting the outer
          overflow-y-auto scroll. */}
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-sub">{asset?.symbol ?? assetId}</span>
            {source != null && connected != null && <LiveDot source={source} connected={connected} />}
          </span>
          <span
            className={cn(
              "nums text-[15px] font-bold transition-colors duration-300",
              flash === "up" ? "text-green-600" : flash === "down" ? "text-red-600" : "text-ink",
            )}
          >
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

        <SegmentedControl
          value={orderType}
          onChange={(v) => setOrderType(v as "market" | "limit")}
          data={[
            { value: "market", label: "Market" },
            { value: "limit", label: "Limit" },
          ]}
          color="brand"
          fullWidth
          size="sm"
        />

        {orderType === "limit" && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-sub">Limit Price</span>
            <input
              type="number"
              min={0}
              step="any"
              value={limitPrice ?? ""}
              onChange={(e) => setLimitPrice(e.target.value === "" ? null : Number(e.target.value))}
              className="h-10 rounded-chip border border-line px-3 text-[14px] font-bold nums outline-none focus:border-purple-400"
            />
            <span className="text-[10px] text-sub">
              Fills once {asset?.symbol ?? assetId} {side === "long" ? "drops to" : "rises to"} this price or better —
              never at a worse price.
            </span>
          </label>
        )}

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

        <Slider
          value={maxSpend > 0 ? Math.min(100, Math.round((amountUsd / maxSpend) * 100)) : 0}
          onChange={(pct) => setAmountUsd(Math.round((pct / 100) * maxSpend))}
          min={0}
          max={100}
          step={25}
          color={side === "long" ? "up" : "down"}
          formatValue={(v) => `${v}%`}
        />

        <Checkbox checked={reduceOnly} onChange={setReduceOnly} label="Reduce Only" size="sm" color="gray" />

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
      </div>

      <div className="mt-auto flex shrink-0 flex-col gap-1.5 border-t border-line pt-3">
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
        ) : orderType === "market" && !price ? (
          <div className="text-[11px] text-sub">Waiting for a live price…</div>
        ) : orderType === "limit" && !limitPrice ? (
          <div className="text-[11px] text-sub">Enter a limit price.</div>
        ) : (
          error && <div className="text-[11px] font-semibold text-red-600">{error}</div>
        )}
        <Button
          color={side === "long" ? "up" : "down"}
          size="lg"
          fullWidth
          disabled={
            (orderType === "market" ? !price : !limitPrice) ||
            amountUsd <= 0 ||
            insufficientFunds ||
            oversized ||
            overRisk
          }
          onClick={submit}
        >
          {orderType === "limit"
            ? `Place ${side === "long" ? "Buy" : "Sell"} Limit`
            : `${side === "long" ? "Buy" : "Sell"} ${asset?.symbol ?? ""}`}
        </Button>
      </div>
    </div>
  );
}
