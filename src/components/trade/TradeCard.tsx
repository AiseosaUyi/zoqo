"use client";
import * as React from "react";
import { Info, Minus, Plus } from "lucide-react";
import { Button, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cents, usd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import type { Side } from "@/lib/types";
import { BulkTradePanel } from "./BulkTradePanel";
import { SideSelector } from "./SideSelector";
import { OrderTypeMenu, PanelModeMenu, type OrderType, type PanelMode } from "./TradeCardMenus";

const QUICK = [1, 5, 10, 100];
/** "One Tap" preset stakes — see ONE_TAP note below for where this comes from. */
const ONE_TAP_PRESETS = [1, 5, 10];
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
  const { signedIn, requireAuth } = useProfile();
  const [panelMode, setPanelMode] = React.useState<PanelMode>("single");
  const [mode, setMode] = React.useState<"buy" | "sell">("buy");
  const [sideInternal, setSideInternal] = React.useState<Side>("up");
  const side = sideProp ?? sideInternal;
  const setSide = onSideChange ?? setSideInternal;
  const [unit, setUnit] = React.useState<"USD" | "Shares">("USD");
  const [orderType, setOrderType] = React.useState<OrderType>("market");
  const [amount, setAmount] = React.useState(0);
  const [limitPrice, setLimitPrice] = React.useState(0);
  const [showHelp, setShowHelp] = React.useState(false);
  const [flash, setFlash] = React.useState(false);
  const [editPresets, setEditPresets] = React.useState(false);
  const [presets, setPresets] = React.useState(ONE_TAP_PRESETS);

  const q = quote(marketId);
  const m = getMarket(marketId);
  const marketPrice = side === "up" ? q.yes : q.no; // cents
  const isLimit = mode === "buy" && orderType === "limit";
  const isOneTap = mode === "buy" && orderType === "oneTap";
  const price = isLimit && limitPrice > 0 ? limitPrice : marketPrice;

  // Default the limit price to the live price when entering limit mode —
  // React's "adjust state during render" pattern (own local state, no
  // side effects on other components), gated on isLimit so it only fires
  // once per mode-entry rather than every render.
  const [limitDefaultedFor, setLimitDefaultedFor] = React.useState(false);
  if (isLimit && limitPrice === 0 && !limitDefaultedFor) {
    setLimitDefaultedFor(true);
    setLimitPrice(round1(marketPrice));
  } else if (!isLimit && limitDefaultedFor) {
    setLimitDefaultedFor(false);
  }

  const shares = unit === "USD" ? (price > 0 ? amount / (price / 100) : 0) : amount;
  const cost = unit === "USD" ? amount : shares * (price / 100);
  const payout = shares * 1; // each correct share settles at $1.00
  const profit = payout - cost;
  const returnPct = cost > 0 ? (profit / cost) * 100 : 0;

  const position = positions.find((p) => p.marketId === marketId && p.side === side);

  const settled = m?.status === "settled";

  // Gated actions must not resume a stale closure: cash/cost/price are frozen
  // at the render where the user first clicked, but signing up changes cash
  // (the $50 grant). `retryTrade` defers the actual trade to a fresh render —
  // after signedIn flips true — so it re-reads current cash/cost/price instead
  // of replaying values captured before the user had any balance.
  const [retryTrade, setRetryTrade] = React.useState(false);

  function doTrade() {
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

  React.useEffect(() => {
    // doTrade() calls buy()/sell() from useZoqo(), which set state on the
    // ZoqoProvider ancestor — genuinely needs an effect, not a render-time
    // adjustment: calling it during this component's own render would be
    // updating a different component's state mid-render, which React
    // explicitly disallows (unlike this component adjusting its own local
    // state, e.g. the limitPrice default above).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (retryTrade && signedIn) {
      setRetryTrade(false);
      doTrade();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTrade, signedIn]);

  function submit() {
    if (!requireAuth(() => setRetryTrade(true))) return;
    doTrade();
  }

  // ---- One Tap: tapping a preset stake tile IS the trade — no amount step,
  // no separate CTA click. Matches the Figma "One Tap" panel (Buy/Sell tabs +
  // Up/Down side buttons + three stake tiles showing preset $ and the payout
  // at current odds; tapping a tile executes immediately). Presets are
  // locally editable via "Edit" — not persisted, it's flavor on top of a real
  // trade, same spirit as the mocked signup bonus in profile.tsx.
  const [retryOneTapAmt, setRetryOneTapAmt] = React.useState<number | null>(null);
  function doOneTap(amt: number) {
    const px = marketPrice;
    const sh = px > 0 ? amt / (px / 100) : 0;
    if (sh <= 0 || amt > cash) return;
    buy(marketId, side, Math.round(sh), px);
    setFlash(true);
    setTimeout(() => setFlash(false), 700);
  }
  React.useEffect(() => {
    // Same reasoning as the retryTrade effect above: doOneTap() calls buy(),
    // which sets state on the ZoqoProvider ancestor.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (retryOneTapAmt != null && signedIn) {
      const amt = retryOneTapAmt;
      setRetryOneTapAmt(null);
      doOneTap(amt);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryOneTapAmt, signedIn]);
  function tapPreset(amt: number) {
    if (!requireAuth(() => setRetryOneTapAmt(amt))) return;
    doOneTap(amt);
  }

  if (panelMode === "bulk") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <PanelModeMenu value={panelMode} onChange={setPanelMode} />
        </div>
        <BulkTradePanel side={side} onSideChange={setSide} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PanelModeMenu value={panelMode} onChange={setPanelMode} />

      <div className="flex items-center justify-between">
        <SegmentedControl
          data={["Buy", "Sell"]}
          value={mode === "buy" ? "Buy" : "Sell"}
          onChange={(v) => setMode(v === "Buy" ? "buy" : "sell")}
          size="md"
        />
        {mode === "buy" && <OrderTypeMenu value={orderType} onChange={setOrderType} />}
      </div>

      {/* Up / Down selector */}
      <SideSelector side={side} onChange={setSide} prices={{ up: q.yes, down: q.no }} />

      <button
        onClick={() => setShowHelp((h) => !h)}
        className="inline-flex items-center gap-1 self-end text-[11px] font-medium text-sub hover:text-ink"
      >
        <Info size={13} /> How it works
      </button>

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLimitPrice((p) => clampPrice((p || marketPrice) - 1))}
              className="grid h-6 w-6 place-items-center rounded-full border hover:bg-gray-50"
            >
              <Minus size={12} />
            </button>
            <span className="w-12 text-center text-[15px] font-bold text-ink nums">
              {cents(limitPrice || marketPrice)}
            </span>
            <button
              onClick={() => setLimitPrice((p) => clampPrice((p || marketPrice) + 1))}
              className="grid h-6 w-6 place-items-center rounded-full border hover:bg-gray-50"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      )}

      {isOneTap ? (
        <>
          {/* preset stake tiles — the tap itself is the trade */}
          <div className="grid grid-cols-3 gap-2">
            {presets.map((amt, i) => {
              const sh = marketPrice > 0 ? amt / (marketPrice / 100) : 0;
              const earn = sh - amt;
              return editPresets ? (
                <input
                  key={i}
                  type="number"
                  min={1}
                  value={amt}
                  onChange={(e) =>
                    setPresets((prev) => {
                      const next = prev.slice();
                      next[i] = Math.max(1, Number(e.target.value) || 1);
                      return next;
                    })
                  }
                  className="rounded-[10px] border bg-surface px-2 py-3 text-center text-[15px] font-bold text-ink outline-none nums"
                />
              ) : (
                <button
                  key={i}
                  disabled={settled || amt > cash}
                  onClick={() => tapPreset(amt)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-[10px] border bg-surface px-2 py-2.5 transition-colors",
                    "hover:border-purple-300 hover:bg-purple-50 disabled:opacity-45 disabled:pointer-events-none",
                  )}
                >
                  <span className="text-[15px] font-bold text-ink nums">${amt}</span>
                  <span className="text-[11px] text-sub">
                    Earn <span className="font-semibold text-green-500 nums">${earn.toFixed(0)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-sub">
              Balance <b className="text-ink nums">{usd(cash)}</b>
            </span>
            <button
              onClick={() => setEditPresets((e) => !e)}
              className="font-semibold text-purple-600 hover:underline"
            >
              {editPresets ? "Done" : "Edit"}
            </button>
          </div>
        </>
      ) : (
        <>
          <SegmentedControl
            data={["USD", "Shares"]}
            value={unit}
            onChange={(v) => setUnit(v as "USD" | "Shares")}
            size="xs"
            className="w-fit"
          />

          {/* amount */}
          <div className="rounded-[12px] border bg-surface px-3 py-2 transition-colors focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-sub">Amount</span>
              <span className="text-[11px] text-sub nums">Bal {usd(cash)}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-bebas text-[28px] text-sub">{unit === "USD" ? "$" : ""}</span>
              <input
                type="number"
                min={0}
                value={amount || ""}
                placeholder="0"
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                className="w-full bg-transparent font-bebas text-[32px] tracking-wide text-ink outline-none placeholder:text-gray-300 nums"
              />
            </div>
          </div>

          {/* quick amounts */}
          <div className="grid grid-cols-5 gap-1.5">
            {QUICK.map((v) => (
              <button
                key={v}
                onClick={() => setAmount((a) => a + v)}
                className="rounded-[8px] border bg-surface py-1.5 text-[12px] font-semibold text-ink transition-colors hover:border-purple-200 hover:bg-purple-50 nums"
              >
                +{unit === "USD" ? "$" : ""}
                {v}
              </button>
            ))}
            <button
              onClick={() =>
                setAmount(unit === "USD" ? Math.floor(cash) : Math.floor(cash / (price / 100)))
              }
              className="rounded-[8px] border border-purple-200 bg-purple-50 py-1.5 text-[12px] font-bold text-purple-700 transition-colors hover:bg-purple-100"
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
            disabled={settled || (mode === "buy" ? shares <= 0 || (signedIn && cost > cash) : !position)}
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
        </>
      )}
    </div>
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
