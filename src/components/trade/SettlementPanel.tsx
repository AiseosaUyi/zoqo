"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Progress, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cents, hhmm, signedUsd, usd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import type { HistoryEntry, Market, Position, Side } from "@/lib/types";

/** How long after closeTime we hold the "settling" state before revealing the
 *  verdict. Synthetic — the engine settles instantly. */
const SETTLE_MS = 4000;

type Phase = "loading" | "settling" | "won" | "lost" | "missed";

const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.12em] text-sub";

/** The user's bet, sourced from a live position (pre-settle) or the settlement
 *  history entry (post-settle). */
interface Slip {
  side: Side;
  shares: number;
  entryPrice: number; // cents
  payout: number; // usd ($1/winning share)
  pnl: number; // usd
  won: boolean;
}

function deriveSlip(
  m: Market,
  pos: Position | undefined,
  hist: HistoryEntry | undefined,
): Slip | null {
  if (hist) {
    const won = hist.result === "won";
    return {
      side: hist.side,
      shares: hist.shares,
      entryPrice: hist.entryPrice,
      payout: won ? hist.shares : 0,
      pnl: hist.pnl,
      won,
    };
  }
  if (pos) {
    const won = pos.side === "up" ? !!m.settledUp : !m.settledUp;
    const payout = won ? pos.shares : 0;
    return {
      side: pos.side,
      shares: pos.shares,
      entryPrice: pos.avgPrice,
      payout,
      pnl: payout - pos.cost,
      won,
    };
  }
  return null;
}

export function SettlementPanel({ marketId }: { marketId: string }) {
  const router = useRouter();
  const { ready, snapshot, getMarket, positions, tradeHistory } = useZoqo();
  const m = getMarket(marketId);

  // Join history to a market by label + strike (HistoryEntry has no marketId).
  const settledHist = m
    ? tradeHistory.find(
        (h) =>
          h.label === m.label &&
          h.strike === m.strike &&
          (h.result === "won" || h.result === "lost"),
      )
    : undefined;
  const exitedEarly = m
    ? tradeHistory.some(
        (h) => h.label === m.label && h.strike === m.strike && h.result === "closed",
      )
    : false;
  const pos = positions.find((p) => p.marketId === marketId);
  const slip = m ? deriveSlip(m, pos, settledHist) : null;
  const participated = !!slip;

  // The live market of this duration, for "Trade the next round".
  const liveId = snapshot?.markets.find(
    (mk) => mk.durationMs === m?.durationMs && mk.status === "live",
  )?.id;

  const now = snapshot?.now ?? 0;
  const phase: Phase = React.useMemo(() => {
    if (!ready || !m) return "loading";
    if (m.status === "settled" && now - m.closeTime < SETTLE_MS) return "settling";
    if (!participated) return "missed";
    return slip?.won ? "won" : "lost";
  }, [ready, m, now, participated, slip]);

  if (phase === "loading" || !m) return <SettlementSkeleton />;

  const outcomeUp = !!m.settledUp;
  const range = `${hhmm(m.openTime)}–${hhmm(m.closeTime)}`;
  const cta =
    liveId != null ? (
      <Button
        color="brand"
        size="lg"
        fullWidth
        onClick={() => router.push(`/market/${encodeURIComponent(liveId)}`)}
      >
        Trade the next round
      </Button>
    ) : null;

  // ---- SETTLING --------------------------------------------------------------
  if (phase === "settling") {
    return (
      <Card>
        <p className={EYEBROW}>Settling · {range}</p>
        <p className="mt-2 text-[19px] font-bold leading-snug text-ink">
          Locking in the result
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-sub">
          Confirming the final price against the strike. Your payout posts to your
          balance automatically.
        </p>
        <div className="mt-4">
          <Progress indeterminate color="gold" size="sm" />
        </div>
      </Card>
    );
  }

  // ---- MISSED ----------------------------------------------------------------
  if (phase === "missed") {
    return (
      <Card>
        <p className={EYEBROW}>Result · {range}</p>
        <p
          className={cn(
            "pop mt-2 font-display text-[44px] leading-[0.85] tracking-[0.01em]",
            outcomeUp ? "text-green-500" : "text-red-500",
          )}
        >
          {outcomeUp ? "UP" : "DOWN"}
        </p>
        <p className="mt-1.5 text-[13px] text-sub">
          {exitedEarly ? "You exited before settlement." : "You didn't trade this round."}
        </p>
        <div className="mt-4 flex flex-col gap-1.5 border-t pt-4">
          <Row label="Closing odds · Up" value={cents(m.yes)} />
          <Row label="Closing odds · Down" value={cents(100 - m.yes)} />
        </div>
        {cta && <div className="mt-4">{cta}</div>}
      </Card>
    );
  }

  // ---- WON / LOST ------------------------------------------------------------
  const won = phase === "won";
  const money = won ? "text-green-500" : "text-red-500";
  return (
    <Card>
      <p className={EYEBROW}>Result · {range}</p>
      <p className={cn("pop mt-2 font-display text-[44px] leading-[0.85] nums", money)}>
        {signedUsd(slip!.pnl)}
      </p>
      <p className="mt-1.5 text-[13px] text-sub">
        {won ? "Won" : "Lost"} · BTC closed {outcomeUp ? "up" : "down"}
      </p>
      <div className="mt-4 flex flex-col gap-1.5 border-t pt-4">
        <Row
          label="Your position"
          value={`${Math.round(slip!.shares)} ${slip!.side === "up" ? "UP" : "DOWN"} @ ${cents(slip!.entryPrice)}`}
        />
        <Row label="Payout" value={usd(slip!.payout)} />
      </div>
      <p className="mt-3 text-[12px] text-sub">
        {won ? "Credited to your balance." : "This round is settled."}
      </p>
      {cta && <div className="mt-4">{cta}</div>}
    </Card>
  );
}

/* ------------------------------------------------------------------ helpers */

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[16px] border bg-surface p-5">{children}</div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-sub">{label}</span>
      <span className="font-semibold text-ink nums">{value}</span>
    </div>
  );
}

function SettlementSkeleton() {
  return (
    <div className="rounded-[16px] border bg-surface p-5">
      <Skeleton width={120} height={12} rounded={6} />
      <Skeleton width={170} height={42} rounded={10} className="mt-3" />
      <Skeleton width={140} height={14} rounded={6} className="mt-2.5" />
      <div className="mt-4 flex flex-col gap-2 border-t pt-4">
        <Skeleton lines={2} />
      </div>
      <Skeleton width="100%" height={48} rounded={12} className="mt-4" />
    </div>
  );
}
