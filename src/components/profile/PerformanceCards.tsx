"use client";
import * as React from "react";
import { Badge, Card } from "@/components/ui";
import { usdCompact, usd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import { distinctMarkets, historyVolume, longestWinStreak } from "@/lib/profileStats";

export function PerformanceCards() {
  const { stats, tradeHistory, positions, exposure } = useZoqo();
  const { wins, losses, tradesPlaced } = stats;

  const winRate = wins + losses > 0 ? wins / (wins + losses) : 0;
  const volume = React.useMemo(() => historyVolume(tradeHistory) + exposure, [tradeHistory, exposure]);
  const markets = React.useMemo(() => distinctMarkets(tradeHistory, positions), [tradeHistory, positions]);
  const avgPerPosition = tradesPlaced > 0 ? volume / tradesPlaced : 0;
  const peakStreak = React.useMemo(() => longestWinStreak(tradeHistory), [tradeHistory]);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[16px] font-bold text-ink">Up / Down Performance</h2>
          <Badge color="brand" variant="soft">
            Zoqo&apos;s Specialization
          </Badge>
        </div>
        <span className="text-[12px] text-sub">
          Peak Winning Streak <b className="text-ink nums">{peakStreak}</b>
        </span>
      </div>

      <Card padding="none" className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-4">
          <div className="text-[12px] text-sub">Win Rate</div>
          <div className="mt-1 font-bebas text-[30px] leading-none nums">{Math.round(winRate * 100)}%</div>
          <div className="mt-1.5 text-[11.5px] text-sub">
            <b className="text-ink nums">{wins}</b> Wins &nbsp;|&nbsp; <b className="text-ink nums">{losses}</b> Losses
          </div>
        </div>
        <div className="p-4">
          <div className="text-[12px] text-sub">Volume Traded</div>
          <div className="mt-1 font-bebas text-[30px] leading-none nums">{usdCompact(volume)}</div>
          <div className="mt-1.5 text-[11.5px] text-sub">Across {markets} Market{markets === 1 ? "" : "s"}</div>
        </div>
        <div className="p-4">
          <div className="text-[12px] text-sub">Total Trades</div>
          <div className="mt-1 font-bebas text-[30px] leading-none nums">{tradesPlaced.toLocaleString()}</div>
          <div className="mt-1.5 text-[11.5px] text-sub">Avg of {usd(avgPerPosition)} per position</div>
        </div>
      </Card>
    </section>
  );
}
