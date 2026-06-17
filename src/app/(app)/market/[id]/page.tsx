"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Clock, Radio } from "lucide-react";
import { TopNav } from "@/components/trade/TopNav";
import { MarketChart } from "@/components/trade/MarketChart";
import { PositionsTable } from "@/components/trade/PositionsTable";
import { RightRail } from "@/components/trade/RightRail";
import { Badge } from "@/components/ui";
import { useZoqo } from "@/lib/store";
import { useChartSeries } from "@/lib/useBtc";
import { ChartToolbar } from "@/components/trade/ChartToolbar";
import { MARKET_DURATIONS, MD_BY_KEY, DEFAULT_DURATION } from "@/lib/timeframe";
import { btc2, countdown, hhmm, pct, usdCompact } from "@/lib/format";
import { cn } from "@/lib/cn";

export default function SingleMarketPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = decodeURIComponent(params.id);
  const { ready, snapshot, priceSeries, btc: price } = useZoqo();
  // chart zoom (default tight immersive); independent of the market duration
  const [chartTf, setChartTf] = React.useState("1m");
  const { series: chartSeries, rangeMs } = useChartSeries(chartTf, priceSeries);
  const [side, setSide] = React.useState<"up" | "down">("up");

  const market = snapshot?.markets.find((m) => m.id === id);
  // live market of THIS market's duration (for "Go to live")
  const live = snapshot?.markets.find(
    (m) => m.durationMs === market?.durationMs && m.status === "live",
  )?.id;
  const durKey =
    MARKET_DURATIONS.find((d) => d.ms === market?.durationMs)?.key ?? DEFAULT_DURATION;
  const onDuration = (key: string) => {
    const liveId = snapshot?.markets.find(
      (m) => m.durationMs === MD_BY_KEY[key] && m.status === "live",
    )?.id;
    if (liveId) router.push(`/market/${encodeURIComponent(liveId)}`);
  };
  // this market's own window signals (YES odds from 50¢ → close)
  const focusProb = snapshot?.probByMarket[id] ?? [];
  const focusVolume = snapshot?.volumeByMarket[id] ?? [];
  const focusSpikes = snapshot?.spikesByMarket[id] ?? [];

  return (
    <div className="min-h-screen">
      <TopNav showBack duration={durKey} onDuration={onDuration} />
      <div className="mx-auto flex max-w-[1440px] gap-0 px-3 py-3">
        <main className="flex min-w-0 flex-1 flex-col pr-0 xl:pr-4">
          {!ready || !snapshot || !market ? (
            <div className="grid h-[520px] place-items-center text-sub">
              {ready && snapshot ? "Market not found." : "Loading market…"}
            </div>
          ) : (
            <>
              <div className="pb-2 pt-1">
                  {/* header */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-orange-500 text-[12px] font-black text-white">
                        ₿
                      </span>
                      <h1 className="font-display text-[24px] font-black leading-tight text-ink">
                        BTC Up or Down · {market.durationMs / 60_000}m
                      </h1>
                      {market.status === "live" && <Badge color="up" variant="dot">Live</Badge>}
                      {market.status === "settled" && (
                        <Badge color={market.settledUp ? "up" : "down"} variant="soft">
                          Settled {market.settledUp ? "Up" : "Down"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-sub nums">
                      {usdCompact(market.volumeUsd)} Vol · {hhmm(market.openTime)}–{hhmm(market.closeTime)}{" "}
                      · Up wins if BTC closes above the open
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {market.status === "live" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1.5 text-[13px] font-bold text-orange-700 nums">
                        <Clock size={14} />
                        {countdown(market.closeTime - snapshot.now)}
                      </span>
                    ) : (
                      live && (
                        <button
                          onClick={() => router.push(`/market/${encodeURIComponent(live)}`)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-purple-500 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-purple-600"
                        >
                          <Radio size={14} /> Go to live
                        </button>
                      )
                    )}
                    <div className="text-right">
                      <div className="text-[11px] text-sub">Price to beat</div>
                      <div className="text-[16px] font-bold text-ink nums">${btc2(market.strike)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-sub">BTC now</div>
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-[16px] font-bold nums", price && price >= market.strike ? "text-green-600" : "text-red-600")}>
                          ${price ? btc2(price) : "—"}
                        </span>
                        <span className={cn("text-[12px] font-semibold nums", market.changePct >= 0 ? "text-green-500" : "text-red-500")}>
                          {pct(market.changePct)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <ChartToolbar tf={chartTf} onTf={setChartTf} />
                  <MarketChart
                    mode="single"
                    showColumns={false}
                    showSignals
                    rangeMs={rangeMs}
                    probSide={side}
                    height={380}
                    priceSeries={chartSeries}
                    markets={snapshot.markets}
                    liveMarketId={live}
                    focusMarketId={id}
                    prob={focusProb}
                    volume={focusVolume}
                    spikes={focusSpikes}
                  />
                  </div>
                </div>
                <div className="border-t">
                  <PositionsTable />
                </div>
              </>
            )}
          </main>
        {ready && market && (
          <aside className="hidden w-[332px] shrink-0 xl:block xl:border-l">
            <RightRail marketId={id} side={side} onSideChange={setSide} />
          </aside>
        )}
      </div>
    </div>
  );
}
