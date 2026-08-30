"use client";
import { cn } from "@/lib/cn";
import { usd, signedUsd } from "@/lib/format";

/** Real rollup of everything already computed elsewhere in the terminal —
 *  no invented numbers. "Feed" is deliberately labeled as feed *age* (ms
 *  since the active asset's price last actually changed), not a fabricated
 *  network ping — ZOQO has no way to measure real round-trip latency to an
 *  upstream exchange, so it doesn't pretend to. Desktop-only, mirroring the
 *  rest of the panel system's `lg:` scope. */
export function TerminalStatusBar({
  openCount,
  longsNotional,
  shortsNotional,
  unrealizedPnl,
  ordersCount,
  ordersNotional,
  feedAgeMs,
}: {
  openCount: number;
  longsNotional: number;
  shortsNotional: number;
  unrealizedPnl: number;
  ordersCount: number;
  ordersNotional: number;
  feedAgeMs: number | null;
}) {
  const delta = longsNotional - shortsNotional;
  const feedStale = feedAgeMs == null || feedAgeMs > 5000;

  return (
    <div className="hidden shrink-0 items-center gap-5 border-t border-line bg-surface px-4 py-1.5 text-[11px] lg:flex">
      <StatusItem label="Open" value={String(openCount)} />
      <StatusItem label="Longs" value={usd(longsNotional)} tone="up" />
      <StatusItem label="Shorts" value={usd(shortsNotional)} tone="down" />
      <StatusItem label="Delta" value={signedUsd(delta)} tone={delta >= 0 ? "up" : "down"} />
      <StatusItem label="uPnL" value={signedUsd(unrealizedPnl)} tone={unrealizedPnl >= 0 ? "up" : "down"} />
      <StatusItem label="Orders" value={`${ordersCount} (${usd(ordersNotional)})`} />
      <div className="ml-auto flex items-center gap-1.5 text-sub">
        <span className={cn("h-1.5 w-1.5 rounded-full", feedStale ? "bg-orange-500" : "bg-green-500")} />
        <span>Feed {formatFeedAge(feedAgeMs)}</span>
      </div>
    </div>
  );
}

function formatFeedAge(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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
