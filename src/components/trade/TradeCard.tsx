"use client";
import * as React from "react";
import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { Button, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cents, usd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import type { Side } from "@/lib/types";

const QUICK = [1, 5, 10, 100];
const round1 = (n: number) => Math.round(n * 10) / 10;
const clampPrice = (n: number) => Math.max(1, Math.min(99, round1(n || 0)));

export function TradeCard({
  marketId,
  side: sideProp,
  onSideChange,
}: {
  marketId: string;
  side?: Side;
  onSideChange?: (s: Side) => void;
}) {
  const { quote, buy, sell, placeLimitOrder, getMarket, cash, positions } = useZoqo();
  const [mode, setMode] = React.useState<"buy" | "sell">("buy");
  const [sideInternal, setSideInternal] = React.useState<Side>("up");
  const side = sideProp ?? sideInternal;
  const setSide = onSideChange ?? setSideInternal;
  const [unit, setUnit] = React.useState<"USD" | "Shares">("USD");
  const [orderType, setOrderType] = React.useState<"market" | "limit">("market");
  const [amount, setAmount] = React.useState(0);
  const [limitPrice, setLimitPrice] = React.useState(0);
  const [showHelp, setShowHelp] = React.useState(false);
  const [flash, setFlash] = React.useState(false);

  const q = quote(marketId);
  const m = getMarket(marketId);
  const marketPrice = side === "up" ? q.yes : q.no; // cents
  const isLimit = mode === "buy" && orderType === "limit";
  const price = isLimit && limitPrice > 0 ? limitPrice : marketPrice;

  // default the limit price to the live price when entering limit mode
  React.useEffect(() => {
    if (isLimit && limitPrice === 0) setLimitPrice(round1(marketPrice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLimit]);

  const shares = unit === "USD" ? (price > 0 ? amount / (price / 100) : 0) : amount;
  const cost = unit === "USD" ? amount : shares * (price / 100);
  const payout = shares * 1; // each correct share settles at $1.00
  const profit = payout - cost;
  const returnPct = cost > 0 ? (profit / cost) * 100 : 0;

  const position = positions.find((p) => p.marketId === marketId && p.side === side);

  const settled = m?.status === "settled";

  function submit() {
    if (mode === "sell") {
      if (position) sell(marketId, side);
      setAmount(0);
      return;
    }
    if (shares <= 0 || cost > cash) return;
    if (isLimit) {
      if (!placeLimitOrder(marketId, side, Math.round(shares), price)) return;
    } else {
      buy(marketId, side, Math.round(shares), price);
    }
    setAmount(0);
    setFlash(true);
    setTimeout(() => setFlash(false), 700);
  }

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        data={["Buy", "Sell"]}
        value={mode === "buy" ? "Buy" : "Sell"}
        onChange={(v) => setMode(v === "Buy" ? "buy" : "sell")}
        size="md"
        fullWidth
      />

      {/* Up / Down selector */}
      <div className="grid grid-cols-2 gap-2">
        <SideButton
          active={side === "up"}
          color="up"
          label="Up"
          price={q.yes}
          icon={<TrendingUp size={15} />}
          onClick={() => setSide("up")}
        />
        <SideButton
          active={side === "down"}
          color="down"
          label="Down"
          price={q.no}
          icon={<TrendingDown size={15} />}
          onClick={() => setSide("down")}
        />
      </div>

      {/* order type + how-it-works */}
      <div className="flex items-center justify-between">
        {mode === "buy" ? (
          <SegmentedControl
            data={["Market", "Limit"]}
            value={orderType === "market" ? "Market" : "Limit"}
            onChange={(v) => setOrderType(v === "Market" ? "market" : "limit")}
            size="xs"
          />
        ) : (
          <span />
        )}
        <button
          onClick={() => setShowHelp((h) => !h)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-sub hover:text-ink"
        >
          <Info size={13} /> How it works
        </button>
      </div>

      {showHelp && (
        <div className="rounded-[10px] bg-purple-50 p-3 text-[11.5px] leading-relaxed text-ink">
          Prices are in <b>cents = implied odds</b>. {cents(q.yes)} on Up means about{" "}
          {Math.round(q.yes)}% likely. Each share pays <b>$1</b> if you&apos;re right and <b>$0</b>{" "}
          if wrong — so buying {side === "up" ? "Up" : "Down"} at {cents(price)} risks {cents(price)}{" "}
          to win $1.00. A <b>Limit</b> order only fills at your price or better.
        </div>
      )}

      {isLimit && (
        <div className="flex items-center justify-between rounded-[10px] border bg-surface px-3 py-2">
          <span className="text-[13px] text-sub">Limit price</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={99}
              value={limitPrice || ""}
              onChange={(e) => setLimitPrice(clampPrice(Number(e.target.value)))}
              className="w-14 bg-transparent text-right text-[15px] font-bold text-ink outline-none nums"
            />
            <span className="text-[14px] font-bold text-sub">¢</span>
          </div>
        </div>
      )}

      <SegmentedControl
        data={["USD", "Shares"]}
        value={unit}
        onChange={(v) => setUnit(v as "USD" | "Shares")}
        size="xs"
        className="w-fit"
      />

      {/* amount */}
      <div className="rounded-[12px] border bg-surface px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-sub">Amount</span>
          <span className="text-[11px] text-sub nums">Bal {usd(cash)}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[26px] font-bold text-sub">{unit === "USD" ? "$" : ""}</span>
          <input
            type="number"
            min={0}
            value={amount || ""}
            placeholder="0"
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            className="w-full bg-transparent text-[30px] font-bold text-ink outline-none placeholder:text-gray-300 nums"
          />
        </div>
      </div>

      {/* quick amounts */}
      <div className="grid grid-cols-5 gap-1.5">
        {QUICK.map((v) => (
          <button
            key={v}
            onClick={() => setAmount((a) => a + v)}
            className="rounded-[8px] border bg-surface py-1.5 text-[12px] font-semibold text-ink hover:bg-gray-50 nums"
          >
            +{unit === "USD" ? "$" : ""}
            {v}
          </button>
        ))}
        <button
          onClick={() => setAmount(unit === "USD" ? Math.floor(cash) : Math.floor(cash / (price / 100)))}
          className="rounded-[8px] border border-purple-200 bg-purple-50 py-1.5 text-[12px] font-bold text-purple-700 hover:bg-purple-100"
        >
          Max
        </button>
      </div>

      {/* summary */}
      <div className="flex flex-col gap-1.5 py-1">
        <Row label="You will receive" value={`${shares.toFixed(2)} ${side === "up" ? "UP" : "DOWN"}`} />
        <Row label="Min. Trade Amount" value="$1" />
        <Row label="Avg. Price" value={cents(price)} />
        <Row
          label="Potential return"
          value={`${usd(payout)} (${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%)`}
          valueClass="text-green-500"
        />
      </div>

      <Button
        color={mode === "sell" ? "gray" : "brand"}
        variant={mode === "sell" ? "soft" : "solid"}
        size="lg"
        fullWidth
        disabled={settled || (mode === "buy" ? shares <= 0 || cost > cash : !position)}
        onClick={submit}
        className={cn(flash && "ring-2 ring-purple-300")}
      >
        {settled
          ? "Market closed"
          : mode === "sell"
            ? position
              ? `Sell ${side === "up" ? "Up" : "Down"} · ${usd(position.shares * (price / 100))}`
              : "No position"
            : isLimit
              ? `Place limit ${side === "up" ? "Up" : "Down"} · ${usd(cost || 0)}`
              : `Buy ${side === "up" ? "Up" : "Down"} · ${usd(cost || 0)}`}
      </Button>
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
  price: number;
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
      <span className="text-[20px] font-black leading-none nums">{cents(price)}</span>
    </button>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-sub">{label}</span>
      <span className={cn("font-semibold text-ink nums", valueClass)}>{value}</span>
    </div>
  );
}
