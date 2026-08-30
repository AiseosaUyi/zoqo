"use client";
import * as React from "react";
import { SegmentedControl, Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { clamp } from "@/lib/math";
import { ageShort, cents, hhmmss, usdCompact } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import type { OrderBook, OrderBookLevel } from "@/lib/types";

export function MarketDepth({ marketId }: { marketId: string }) {
  const [tab, setTab] = React.useState("Order Book");
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        data={["Order Book", "Live Trades", "Holders"]}
        value={tab}
        onChange={setTab}
        size="sm"
        fullWidth
      />
      {tab === "Order Book" && <OrderBookView marketId={marketId} />}
      {tab === "Live Trades" && <LiveTradesView marketId={marketId} />}
      {tab === "Holders" && <TopHoldersView marketId={marketId} />}
    </div>
  );
}

/** Mirror an Up-outcome book level to the Down outcome: price inverts
 *  (100 - p) and asks/bids swap sides, since Down is just the same market
 *  seen from the other outcome — same underlying data, not fabricated. */
function mirrorLevel(l: OrderBookLevel): OrderBookLevel {
  return { ...l, price: 100 - l.price };
}

function OrderBookView({ marketId }: { marketId: string }) {
  const { snapshot } = useZoqo();
  const [side, setSide] = React.useState<"Up" | "Down">("Down");
  const book: OrderBook | undefined = snapshot?.orderBookByMarket[marketId];
  if (!book) return <Empty />;

  const down = side === "Down";
  const asks = (down ? book.bids : book.asks).slice(0, 6).map((l) => (down ? mirrorLevel(l) : l)).reverse();
  const bids = (down ? book.asks : book.bids).slice(0, 6).map((l) => (down ? mirrorLevel(l) : l));
  const last = down ? 100 - book.last : book.last;
  const upPct = clamp(book.last, 0, 100);

  return (
    <div className="text-[12px]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex items-center overflow-hidden rounded-full border border-line text-[11.5px] font-semibold">
          <button
            onClick={() => setSide("Up")}
            className={cn(
              "px-3 py-1 transition-colors",
              side === "Up" ? "bg-green-500 text-white" : "text-sub hover:bg-muted",
            )}
          >
            Up
          </button>
          <button
            onClick={() => setSide("Down")}
            className={cn(
              "px-3 py-1 transition-colors",
              side === "Down" ? "bg-red-500 text-white" : "text-sub hover:bg-muted",
            )}
          >
            Down
          </button>
        </div>
        <Badge color="gray" size="sm">
          Simulated
        </Badge>
      </div>
      {/* thin sentiment bar — split at the real last-traded price */}
      <div className="mb-2 flex h-1.5 overflow-hidden rounded-full bg-red-200">
        <div className="h-full bg-green-500" style={{ width: `${upPct}%` }} />
      </div>
      <div className="mb-1 grid grid-cols-3 px-1 text-[10.5px] font-medium text-sub">
        <span>Price</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Total</span>
      </div>
      <div className="flex flex-col gap-px">
        {asks.map((l, i) => (
          <DepthRow key={`a${i}`} l={l} max={book.maxCumulative} tone="down" />
        ))}
      </div>
      <div className="my-1.5 flex items-center justify-between rounded-[8px] border border-line bg-muted px-2 py-1.5">
        <span className="font-bebas text-[15px] tracking-wide text-ink nums">
          {cents(last)}{" "}
          <span className="font-sans text-[10.5px] font-normal text-sub">({ageShort(book.lastAgeSec * 1000)})</span>
        </span>
        <span className="text-[11px] text-sub nums">Spread {cents(book.spread)}</span>
      </div>
      <div className="flex flex-col gap-px">
        {bids.map((l, i) => (
          <DepthRow key={`b${i}`} l={l} max={book.maxCumulative} tone="up" />
        ))}
      </div>
    </div>
  );
}

function DepthRow({ l, max, tone }: { l: OrderBookLevel; max: number; tone: "up" | "down" }) {
  const w = Math.min(100, (l.cumulative / max) * 100);
  return (
    <div className="relative grid grid-cols-3 items-center rounded-[6px] px-1.5 py-1 nums transition-colors hover:bg-muted">
      <div
        className={cn(
          "absolute inset-y-0 right-0 bg-gradient-to-l",
          tone === "up" ? "from-green-100 to-green-100/0" : "from-red-100 to-red-100/0",
        )}
        style={{ width: `${w}%` }}
      />
      <span className={cn("relative font-bold", tone === "up" ? "text-green-600" : "text-red-600")}>
        {cents(l.price)}
      </span>
      <span className="relative text-right text-ink">{l.shares.toLocaleString()}</span>
      <span className="relative text-right text-sub">{usdCompact(l.cumulative * (l.price / 100))}</span>
    </div>
  );
}

function LiveTradesView({ marketId }: { marketId: string }) {
  const { snapshot } = useZoqo();
  const trades = (snapshot?.trades ?? []).filter((t) => t.marketId === marketId).slice(0, 14);
  if (!trades.length) return <Empty />;
  return (
    <div className="flex flex-col gap-px text-[12px] scroll-thin max-h-[280px] overflow-auto">
      {trades.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-center gap-2 rounded-[8px] px-1.5 py-1.5",
            t.whale && "bg-blue-50",
            t.trader.name === "You" && "bg-purple-50",
          )}
        >
          <Avatar name={t.trader.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate font-semibold text-ink">{t.trader.name}</span>
              {t.whale && <Badge color="blue" size="sm">🐋 Whale</Badge>}
            </div>
            <span className="text-[10.5px] text-sub nums">{hhmmss(t.ts)}</span>
          </div>
          <div className="text-right">
            <div className={cn("font-bold nums", t.side === "up" ? "text-green-600" : "text-red-600")}>
              {t.side === "up" ? "Up" : "Down"} {cents(t.price)}
            </div>
            <div className="text-[10.5px] text-sub nums">{usdCompact(t.notional)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TopHoldersView({ marketId }: { marketId: string }) {
  const { snapshot } = useZoqo();
  const holders = (snapshot?.holdersByMarket[marketId] ?? []).slice(0, 8);
  if (!holders.length) return <Empty />;
  return (
    <div className="flex flex-col gap-px text-[12px]">
      {holders.map((h, i) => (
        <div key={i} className="flex items-center gap-2 rounded-[8px] px-1.5 py-1.5">
          <span className="w-4 text-center text-[11px] font-bold text-sub nums">{i + 1}</span>
          <Avatar name={h.trader.name} size="sm" />
          <span className="min-w-0 flex-1 truncate font-semibold text-ink">{h.trader.name}</span>
          <Badge color={h.side === "up" ? "up" : "down"} size="sm">
            {h.side === "up" ? "Up" : "Down"}
          </Badge>
          <span className="w-16 text-right text-ink nums">{h.shares.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return <div className="py-6 text-center text-[12px] text-sub">Warming up the tape…</div>;
}
