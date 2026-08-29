"use client";
import { cn } from "@/lib/cn";
import { Tooltip } from "./Tooltip";

/** Connection-status indicator for a live price feed — the honest signal
 *  real trading terminals always show next to a ticker (MT5's connection
 *  light, Binance's "Live"/"Delayed" badge). ZOQO already tracks which feed
 *  is active and whether it's a WebSocket or a slower poll fallback
 *  (`source`/`connected` from `useLiveBtc`/`useAssetPrice`) but never
 *  surfaced it — so a degraded connection (WS blocked by network/geo,
 *  silently falling back to a 4s poll) looked identical to a healthy one
 *  and just read as "the chart feels dead," not "you're on a slow feed."
 *  `source` already carries " (poll)" when polling — stripped for display,
 *  used instead to decide the dot's color/label. */
export function LiveDot({ source, connected, className }: { source: string; connected: boolean; className?: string }) {
  const polling = source.includes("(poll)");
  const live = connected && !polling;
  const cleanSource = source.replace(/ \(poll\)$/, "");

  return (
    <Tooltip
      label={
        connected
          ? `${live ? "Live" : "Delayed"} — ${cleanSource}${polling ? ", polling every 4s" : ""}`
          : "Connecting…"
      }
      side="bottom"
    >
      <span className={cn("inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide", className)}>
        <span className="relative flex h-1.5 w-1.5">
          {live && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          )}
          <span
            className={cn(
              "relative inline-flex h-1.5 w-1.5 rounded-full",
              live ? "bg-green-500" : connected ? "bg-amber-500" : "bg-gray-400",
            )}
          />
        </span>
        <span className={live ? "text-green-600" : connected ? "text-amber-600" : "text-sub"}>
          {live ? "Live" : connected ? "Delayed" : "…"}
        </span>
      </span>
    </Tooltip>
  );
}
