"use client";
import * as React from "react";
import { ChevronDown, Download, Plus } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { usd, signedUsd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import { todaysPnl } from "@/lib/profileStats";
import { DepositModal } from "@/components/trade/DepositModal";

export function PortfolioCards() {
  const { portfolioValue, cash, tradeHistory } = useZoqo();
  const [depositOpen, setDepositOpen] = React.useState(false);
  const { total, points } = React.useMemo(() => todaysPnl(tradeHistory), [tradeHistory]);
  const baseline = portfolioValue - total;
  const pct = baseline > 0 ? (total / baseline) * 100 : 0;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-ink">My Portfolio</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="soft"
            color="gray"
            leftIcon={<Download size={14} />}
            disabled
            title="Play money only — no real withdrawals in this demo"
          >
            Withdraw
          </Button>
          <Button size="sm" color="brand" leftIcon={<Plus size={14} />} onClick={() => setDepositOpen(true)}>
            Deposit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
        <Card padding="none" className="grid grid-cols-2 divide-x divide-line">
          <div className="p-4">
            <div className="text-[12px] text-sub">Portfolio Balance</div>
            <div className="mt-1 font-bebas text-[30px] leading-none nums">{usd(portfolioValue)}</div>
            <div className="mt-1.5 text-[11.5px] text-sub">
              <span className={cn("font-semibold", total >= 0 ? "text-green-500" : "text-red-500")}>
                {signedUsd(total)} ({pct >= 0 ? "+" : ""}
                {pct.toFixed(2)}%)
              </span>{" "}
              Today
            </div>
          </div>
          <div className="p-4">
            <div className="text-[12px] text-sub">Cash Balance</div>
            <div className="mt-1 font-bebas text-[30px] leading-none nums">{usd(cash)}</div>
            <div className="mt-1.5 text-[11.5px] text-sub">Available to trade</div>
          </div>
        </Card>

        <Card padding="none" className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-sub">Todays P&L</span>
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-sub">
              24h <ChevronDown size={12} />
            </span>
          </div>
          <div
            className={cn(
              "mt-1 font-bebas text-[26px] leading-none nums",
              total >= 0 ? "text-green-500" : "text-red-500",
            )}
          >
            {signedUsd(total)}
          </div>
          <div className="mt-2 h-9">
            <Sparkline points={points} positive={total >= 0} />
          </div>
        </Card>
      </div>

      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />
    </section>
  );
}

function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) {
    return <div className="flex h-full items-center text-[10.5px] text-sub">No trades closed today yet</div>;
  }
  const w = 160;
  const h = 36;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = Math.max(1e-6, max - min);
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - ((p - min) / range) * h).toFixed(1)}`)
    .join(" ");
  const color = positive ? "var(--color-green-500)" : "var(--color-red-500)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
