"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Badge, Button, Checkbox, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cents, usd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { MARKET_DURATIONS } from "@/lib/timeframe";
import { SideSelector } from "./SideSelector";
import type { Side } from "@/lib/types";

const QUICK = [1, 5, 10];

/**
 * Group Trade / Bulk Order mode (Figma "Group Trade" section). Places the
 * same Up/Down bet across several markets in one action.
 *
 * The Figma mock shows six checkboxes for consecutive same-duration time
 * slots (14:45, 14:50, …), but MarketEngine only ever materializes one
 * live + one upcoming market per duration (`N_FUTURE = 1` in engine.ts) —
 * there's no real data behind a row of six future 5-min slots. Rather than
 * fake that list, this picks from the real tradable markets across every
 * duration (5m/10m/15m/30m/1h), so "bulk" here means "the same bet across
 * every timeframe's live/next round" — a real, engine-backed set of choices
 * that plays the same "select many, trade once" interaction Figma shows.
 */
export function BulkTradePanel({
  side,
  onSideChange,
}: {
  side: Side;
  onSideChange: (s: Side) => void;
}) {
  const { snapshot, quote, buy, sell, cash, positions } = useZoqo();
  const { signedIn, requireAuth } = useProfile();
  const [mode, setMode] = React.useState<"buy" | "sell">("buy");
  const [amount, setAmount] = React.useState(10);
  const [selected, setSelected] = React.useState<Set<string> | null>(null); // null = not seeded yet
  const [flash, setFlash] = React.useState(false);

  const tradable = React.useMemo(() => {
    const list = (snapshot?.markets ?? []).filter(
      (m) => m.status === "live" || m.status === "upcoming",
    );
    return list.slice().sort((a, b) => a.durationMs - b.durationMs || a.openTime - b.openTime);
  }, [snapshot]);

  // Default selection = every currently-live market (one per duration),
  // matching the Figma default of "all checked" — own local state, so this
  // uses React's "adjust state during render" pattern instead of an effect.
  if (selected === null && tradable.length > 0) {
    setSelected(new Set(tradable.filter((m) => m.status === "live").map((m) => m.id)));
  }

  const sel = selected ?? new Set<string>();
  const selectedMarkets = tradable.filter((m) => sel.has(m.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allChecked = tradable.length > 0 && selectedMarkets.length === tradable.length;
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(tradable.map((m) => m.id)));

  // aggregate preview across selected markets
  let totalShares = 0;
  let totalCost = 0;
  let closableCount = 0;
  for (const m of selectedMarkets) {
    const q = quote(m.id);
    const price = side === "up" ? q.yes : q.no;
    if (mode === "buy") {
      const sh = price > 0 ? amount / (price / 100) : 0;
      totalShares += sh;
      totalCost += amount;
    } else if (positions.some((p) => p.marketId === m.id && p.side === side)) {
      closableCount += 1;
    }
  }
  const avgPrice = totalShares > 0 ? (totalCost / totalShares) * 100 : 0;
  const orders = mode === "buy" ? selectedMarkets.length : closableCount;

  function run() {
    if (mode === "sell") {
      for (const m of selectedMarkets) {
        if (positions.some((p) => p.marketId === m.id && p.side === side)) sell(m.id, side);
      }
      return;
    }
    if (amount <= 0 || totalCost > cash) return;
    for (const m of selectedMarkets) {
      const q = quote(m.id);
      const price = side === "up" ? q.yes : q.no;
      const sh = price > 0 ? amount / (price / 100) : 0;
      if (sh > 0) buy(m.id, side, Math.round(sh), price);
    }
    setFlash(true);
    setTimeout(() => setFlash(false), 700);
  }

  // Same deferred-retry pattern as TradeCard: don't replay a closure captured
  // before signup credits the bonus — wait for a fresh render once signed in.
  const [retryRun, setRetryRun] = React.useState(false);
  React.useEffect(() => {
    // run() calls buy()/sell() from useZoqo(), which set state on the
    // ZoqoProvider ancestor — needs an effect for the same reason as
    // TradeCard's retryTrade (see its comment): can't update a different
    // component's state mid-render.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (retryRun && signedIn) {
      setRetryRun(false);
      run();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryRun, signedIn]);

  function submit() {
    if (!requireAuth(() => setRetryRun(true))) return;
    run();
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

      <SideSelector side={side} onChange={onSideChange} />

      {/* market picker */}
      <div className="rounded-[12px] border bg-surface">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <Checkbox
            checked={allChecked}
            indeterminate={selectedMarkets.length > 0 && !allChecked}
            onChange={toggleAll}
            size="sm"
            label={<span className="font-semibold text-ink">All markets</span>}
          />
          <span className="text-[11px] text-sub nums">{selectedMarkets.length} selected</span>
        </div>
        <div className="scroll-thin flex max-h-40 flex-col gap-0.5 overflow-y-auto p-1.5">
          {tradable.length === 0 && (
            <p className="px-2 py-3 text-center text-[12px] text-sub">No tradable markets yet.</p>
          )}
          {tradable.map((m) => {
            const durLabel =
              MARKET_DURATIONS.find((d) => d.ms === m.durationMs)?.label ??
              `${m.durationMs / 60_000}m`;
            return (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2 rounded-[8px] px-1.5 py-1.5 hover:bg-gray-50"
              >
                <Checkbox checked={sel.has(m.id)} onChange={() => toggle(m.id)} size="sm" />
                <span className="w-7 shrink-0 text-[11px] font-semibold text-sub">{durLabel}</span>
                <span className="text-[13px] font-medium text-ink nums">{m.label}</span>
                {m.status === "live" && (
                  <Badge color="up" variant="dot" size="sm" className="ml-auto">
                    Live
                  </Badge>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {mode === "buy" && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-sub">Order type</span>
            <span className="inline-flex items-center gap-1 text-[13px] font-bold text-ink">
              Market <ChevronDown size={14} className="text-sub" />
            </span>
          </div>

          <div className="rounded-[12px] border bg-surface px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-sub">Amount per market</span>
              <span className="text-[11px] text-sub nums">Bal {usd(cash)}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-[26px] font-bold text-sub">$</span>
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

          <div className="grid grid-cols-4 gap-1.5">
            {QUICK.map((v) => (
              <button
                key={v}
                onClick={() => setAmount((a) => a + v)}
                className="rounded-[8px] border bg-surface py-1.5 text-[12px] font-semibold text-ink hover:bg-gray-50 nums"
              >
                +${v}
              </button>
            ))}
            <button
              onClick={() => setAmount(Math.floor(cash / Math.max(1, selectedMarkets.length)))}
              className="rounded-[8px] border border-purple-200 bg-purple-50 py-1.5 text-[12px] font-bold text-purple-700 hover:bg-purple-100"
            >
              Max
            </button>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5 py-1">
        {mode === "buy" && (
          <>
            <Row label="Avg. Price" value={totalShares > 0 ? cents(avgPrice) : "—"} />
            <Row label="To win" value={usd(totalShares)} valueClass="text-green-500" />
          </>
        )}
        <Row label="Orders" value={String(orders)} />
        <Row label={mode === "buy" ? "Total Cost" : "Positions closing"} value={mode === "buy" ? usd(totalCost) : String(orders)} />
      </div>

      <Button
        color={mode === "sell" ? "gray" : side === "up" ? "up" : "down"}
        variant={mode === "sell" ? "soft" : "solid"}
        size="lg"
        fullWidth
        disabled={
          mode === "buy"
            ? totalShares <= 0 || (signedIn && totalCost > cash)
            : closableCount === 0
        }
        onClick={submit}
        className={cn(flash && "ring-2 ring-purple-300")}
      >
        {mode === "sell"
          ? closableCount > 0
            ? `Close ${closableCount} ${side === "up" ? "Up" : "Down"} position${closableCount === 1 ? "" : "s"}`
            : "No matching positions"
          : `Buy ${side === "up" ? "Up" : "Down"} · ${usd(totalCost || 0)}`}
      </Button>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-sub">{label}</span>
      <span className={cn("font-semibold text-ink nums", valueClass)}>{value}</span>
    </div>
  );
}
