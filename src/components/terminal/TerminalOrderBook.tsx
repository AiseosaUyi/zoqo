"use client";
import * as React from "react";
import { Badge, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { price as formatPrice } from "@/lib/format";
import { ASSET_BY_ID } from "@/lib/assets";
import { synthBook, type BookLevel } from "@/lib/orderBookSim";
import { useTicker } from "@/lib/useTicker";

/** Simulated depth ladder for the active terminal asset, with a price-
 *  grouping control (mirrors a real terminal's tick-size dropdown). The
 *  book is synthetic — no exchange gives ZOQO real L2 depth for BTC/gold/
 *  forex — so it's explicitly labeled "Simulated" and never rendered as if
 *  it were real order flow, the same honesty rule the Poisson tape and
 *  prediction-market order book already follow. */
export function TerminalOrderBook({ assetId, price }: { assetId: string; price: number | null }) {
  const asset = ASSET_BY_ID[assetId];
  const ticks = asset?.bookTicks ?? [1];
  const [tickIdx, setTickIdx] = React.useState(0);
  const safeIdx = Math.min(tickIdx, ticks.length - 1);
  const tickSize = ticks[safeIdx];
  const nowMs = useTicker(1000);

  // React's "adjust state during render" pattern (same as TerminalShell's
  // appliedMockLessonParam — a ref can't be read/written during render
  // under this project's lint rules) — reset grouping to the finest option
  // whenever the asset changes, since a forex tick size like 0.00001
  // carried over from BTC would group nothing meaningfully.
  const [appliedAssetId, setAppliedAssetId] = React.useState(assetId);
  if (appliedAssetId !== assetId) {
    setAppliedAssetId(assetId);
    setTickIdx(0);
  }

  const decimals = asset?.decimals ?? 2;
  const book = price ? synthBook(assetId, price, nowMs, tickSize) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-sub">Order Book</span>
          <Badge color="gray" size="sm">
            Simulated
          </Badge>
        </div>
        <Select
          size="sm"
          value={String(tickSize)}
          onChange={(v) => {
            const i = ticks.findIndex((t) => String(t) === v);
            if (i >= 0) setTickIdx(i);
          }}
          data={ticks.map((t) => ({ value: String(t), label: `Group ${t}` }))}
          className="w-28"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 text-[12px]">
        {!book || (book.bids.length === 0 && book.asks.length === 0) ? (
          <div className="py-6 text-center text-[12px] text-sub">Waiting for a live price…</div>
        ) : (
          <>
            <div className="mb-1 grid grid-cols-3 px-1 text-[10.5px] font-medium text-sub">
              <span>Price</span>
              <span className="text-right">Size</span>
              <span className="text-right">Total</span>
            </div>
            <div className="flex flex-col gap-px">
              {[...book.asks].reverse().map((l, i) => (
                <DepthRow key={`a${i}`} l={l} max={book.maxCumulative} tone="down" decimals={decimals} />
              ))}
            </div>
            <div className="my-1.5 flex items-center justify-between rounded-[8px] border border-line bg-muted px-2 py-1.5">
              <span className="font-bebas text-[15px] tracking-wide text-ink nums">
                {formatPrice(price ?? 0, decimals)}
              </span>
              <span className="text-[11px] text-sub nums">Spread {formatPrice(book.spread, decimals)}</span>
            </div>
            <div className="flex flex-col gap-px">
              {book.bids.map((l, i) => (
                <DepthRow key={`b${i}`} l={l} max={book.maxCumulative} tone="up" decimals={decimals} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DepthRow({
  l,
  max,
  tone,
  decimals,
}: {
  l: BookLevel;
  max: number;
  tone: "up" | "down";
  decimals: number;
}) {
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
        {formatPrice(l.price, decimals)}
      </span>
      <span className="relative text-right text-ink">{l.size.toFixed(3)}</span>
      <span className="relative text-right text-sub">{l.cumulative.toFixed(3)}</span>
    </div>
  );
}
