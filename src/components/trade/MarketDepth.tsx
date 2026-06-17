"use client";
import * as React from "react";
import { SegmentedControl, Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ageShort, cents, hhmmss, usdCompact } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import type { OrderBook, OrderBookLevel } from "@/lib/types";

export function MarketDepth({ marketId }: { marketId: string }) {
  const [tab, setTab] = React.useState("Order Book");
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        data={["Order Book", "Live Trades", "Top Holders"]}
        value={tab}
        onChange={setTab}
        size="sm"
        fullWidth
      />
      {tab === "Order Book" && <OrderBookView marketId={marketId} />}
      {tab === "Live Trades" && <LiveTradesView marketId={marketId} />}
      {tab === "Top Holders" && <TopHoldersView marketId={marketId} />}
    </div>
  );
}

function OrderBookView({ marketId }: { marketId: string }) {
  const { snapshot } = useZoqo();
  const book: OrderBook | undefined = snapshot?.orderBookByMarket[marketId];
  if (!book) return <Empty />;
  const asks = book.asks.slice(0, 6).reverse();
  const bids = book.bids.slice(0, 6);

  return (
    <div className="text-[12px]">
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
      <div className="my-1.5 flex items-center justify-between rounded-[8px] bg-muted px-2 py-1">
        <span className="font-bold text-ink nums">
          Last {cents(book.last)}{" "}
          <span className="font-normal text-sub">({ageShort(book.lastAgeSec * 1000)})</span>
        </span>
        <span className="text-sub nums">Spread {cents(book.spread)}</span>
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
    <div className="relative grid grid-cols-3 items-center px-1 py-1 nums">
      <div
        className={cn("absolute inset-y-0 right-0", tone === "up" ? "bg-green-100" : "bg-red-100")}
        style={{ width: `${w}%` }}
      />
      <span className={cn("relative font-semibold", tone === "up" ? "text-green-600" : "text-red-600")}>
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
