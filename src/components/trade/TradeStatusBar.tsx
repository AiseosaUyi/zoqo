"use client";
import { cn } from "@/lib/cn";
import { usd, signedUsd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import { LiveDot } from "@/components/ui";

/** Page-wide rollup of the wallet already computed elsewhere on /trade —
 *  same recipe as /terminal's TerminalStatusBar, adapted to Up/Down
 *  notional instead of Longs/Shorts. Desktop-only, mirrors the rest of the
 *  panel system's `lg:` scope. */
export function TradeStatusBar() {
  const { positions, openOrders, getMarket, source, connected } = useZoqo();

  let upNotional = 0;
  let downNotional = 0;
  let unrealizedPnl = 0;
  for (const p of positions) {
    const m = getMarket(p.marketId);
    const cur = m ? (p.side === "up" ? m.yes : 100 - m.yes) : p.avgPrice;
    const value = p.shares * (cur / 100);
    if (p.side === "up") upNotional += value;
    else downNotional += value;
    unrealizedPnl += value - p.cost;
  }
  const delta = upNotional - downNotional;
  const ordersNotional = openOrders.reduce((s, o) => s + o.shares * (o.limitPrice / 100), 0);

  return (
    <div className="hidden shrink-0 items-center gap-5 border-t border-line bg-surface px-4 py-1.5 text-[11px] lg:flex">
      <StatusItem label="Open" value={String(positions.length)} />
      <StatusItem label="Up" value={usd(upNotional)} tone="up" />
      <StatusItem label="Down" value={usd(downNotional)} tone="down" />
      <StatusItem label="Delta" value={signedUsd(delta)} tone={delta >= 0 ? "up" : "down"} />
      <StatusItem label="uPnL" value={signedUsd(unrealizedPnl)} tone={unrealizedPnl >= 0 ? "up" : "down"} />
      <StatusItem label="Orders" value={`${openOrders.length} (${usd(ordersNotional)})`} />
      <div className="ml-auto">
        <LiveDot source={source} connected={connected} />
      </div>
    </div>
  );
}

function StatusItem({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <span className="flex items-center gap-1.5 text-sub">
      <span>{label}</span>
      <span
        className={cn(
          "nums font-semibold",
          tone === "up" ? "text-green-600" : tone === "down" ? "text-red-600" : "text-ink",
        )}
      >
        {value}
      </span>
    </span>
  );
}
