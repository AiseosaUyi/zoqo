"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/trade/TopNav";
import { MarketColumns } from "@/components/trade/MarketColumns";
import { MarketChart } from "@/components/trade/MarketChart";
import { MarketActivityCard } from "@/components/trade/MarketActivityCard";
import { PositionsTable } from "@/components/trade/PositionsTable";
import { RightRail } from "@/components/trade/RightRail";
import { MarketDepth } from "@/components/trade/MarketDepth";
import { MobileTradeBar } from "@/components/trade/MobileTradeBar";
import { useMeasure } from "@/components/trade/useMeasure";
import { SegmentedControl, Switch } from "@/components/ui";
import { useZoqo } from "@/lib/store";
import { DEFAULT_DURATION, MARKET_DURATIONS, MD_BY_KEY } from "@/lib/timeframe";
import { PAD_RIGHT, padLeftFor, plotWidth, timeToX, type TimelineGeo } from "@/lib/chartGeo";
import { clamp } from "@/lib/math";
import { btc, btc2 } from "@/lib/format";

const TARGET_COL = 168; // aim for ~168px-wide market cards; fewer columns when narrow

export default function MultiMarketPage() {
  const router = useRouter();
  const { ready, snapshot, priceSeries, positions, tradeHistory, btc: price } = useZoqo();
  const [duration, setDuration] = React.useState(DEFAULT_DURATION); // which market
  const [showSignals, setShowSignals] = React.useState(false);
  const [selected, setSelected] = React.useState<string | undefined>();
  const [side, setSide] = React.useState<"up" | "down">("up");
  const [panMs, setPanMs] = React.useState(0); // 0 = latest; >0 = panned into the past
  const [hoverId, setHoverId] = React.useState<string | undefined>();

  const durMs = MD_BY_KEY[duration];
  const markets = React.useMemo(
    () =>
      (snapshot?.markets.filter((m) => m.durationMs === durMs) ?? [])
        .slice()
        .sort((a, b) => a.openTime - b.openTime),
    [snapshot, durMs],
  );
  const live = markets.find((m) => m.status === "live")?.id;
  const tradingId = selected && markets.some((m) => m.id === selected) ? selected : live;
  const open = (id: string) => router.push(`/market/${encodeURIComponent(id)}`);
  const focusMarket = markets.find((m) => m.id === tradingId);
  const focusProb = (tradingId && snapshot?.probByMarket[tradingId]) || [];
  const focusVolume = (tradingId && snapshot?.volumeByMarket[tradingId]) || [];
  const focusSpikes = (tradingId && snapshot?.spikesByMarket[tradingId]) || [];

  // ---- timeline geometry: header + chart share one time→x mapping ----
  const { ref: tlRef, width: tlWidth } = useMeasure<HTMLDivElement>();
  const padL = padLeftFor(showSignals);
  // how many markets fit at a readable width (fewer on narrow screens)
  const view = tlWidth > 0 ? clamp(Math.round((tlWidth - padL - PAD_RIGHT) / TARGET_COL), 3, 6) : 6;
  const span = view * durMs; // visible time span
  const latestClose = markets.at(-1)?.closeTime ?? snapshot?.now ?? 1;
  const earliestOpen = markets[0]?.openTime ?? 0;
  const maxPan = Math.max(0, latestClose - span - earliestOpen);
  const pan = clamp(panMs, 0, maxPan);
  const t1 = latestClose - pan;
  const t0 = t1 - span;
  const geo: TimelineGeo = { width: tlWidth, padL, padR: PAD_RIGHT, t0, t1 };

  const canOlder = pan < maxPan - 1;
  const canNewer = pan > 1;

  // ---- hover activity card ----
  const hoverMarket = hoverId ? markets.find((m) => m.id === hoverId) : undefined;
  const hoverPos = hoverId ? positions.find((p) => p.marketId === hoverId) : undefined;
  const hoverHist = hoverMarket
    ? tradeHistory.filter((e) => e.label === hoverMarket.label && e.strike === hoverMarket.strike)
    : [];
  // anchor the card to the hovered band's center, clamped within the plot
  const CARD_W = 210;
  const hoverX = hoverMarket
    ? clamp(
        timeToX(geo, (hoverMarket.openTime + hoverMarket.closeTime) / 2) - CARD_W / 2,
        4,
        Math.max(4, tlWidth - CARD_W - 4),
      )
    : 0;
  // n = -1 (left/older) pans back in time → larger panMs; +1 (right/newer) → smaller
  const stepMarkets = (n: number) => setPanMs((p) => clamp(p - n * durMs, 0, maxPan));

  // drag-to-pan: pull right → domain shifts back → older markets slide in
  const drag = React.useRef<{ x: number; pan: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-pan]")) return;
    drag.current = { x: e.clientX, pan, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      setHoverId(undefined); // don't show the hover card while panning
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const dMs = (dx / plotWidth(geo)) * span; // px → time
    setPanMs(clamp(d.pan + dMs, 0, maxPan));
  };
  const endDrag = () => {
    drag.current = null;
    // defer clearing so the click-capture suppressor still sees `dragging`
    requestAnimationFrame(() => setDragging(false));
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragging) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="min-h-screen">
      <TopNav duration={duration} onDuration={setDuration} />
      <div className="mx-auto flex max-w-[1440px] flex-col gap-0 px-3 py-3 lg:flex-row">
        <main className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0 lg:pr-4">
          {!ready || !snapshot ? (
            <ChartSkeleton />
          ) : (
            <>
              {/* mobile-only market-duration selector (hidden in the nav below lg) */}
              <div className="mb-2 lg:hidden">
                <SegmentedControl
                  data={MARKET_DURATIONS.map((d) => ({ value: d.key, label: d.label }))}
                  value={duration}
                  onChange={setDuration}
                  size="sm"
                  fullWidth
                />
              </div>
              <div
                ref={tlRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClickCapture={onClickCapture}
                className={dragging ? "cursor-grabbing select-none" : "cursor-grab"}
              >
                <MarketColumns
                  markets={markets}
                  geo={geo}
                  now={snapshot.now}
                  liveMarketId={live}
                  selectedId={tradingId}
                  canOlder={canOlder}
                  canNewer={canNewer}
                  onStep={stepMarkets}
                  onHover={setHoverId}
                  onSelect={setSelected}
                  onActivate={open}
                />
                <div className="pb-1 pt-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="ml-1 flex items-center gap-3 text-[12px]">
                      <span className="text-sub">
                        Target{" "}
                        <b className="text-ink nums">{focusMarket ? btc(focusMarket.strike) : "—"}</b>
                      </span>
                      <span className="text-sub">
                        BTC <b className="text-purple-600 nums">{price ? btc2(price) : "—"}</b>
                      </span>
                    </span>
                    <span data-no-pan>
                      <Switch
                        checked={showSignals}
                        onChange={setShowSignals}
                        label={<span className="font-medium">Signals</span>}
                      />
                    </span>
                  </div>
                  <div className="relative">
                    <MarketChart
                      mode="multi"
                      showColumns
                      showSignals={showSignals}
                      viewStart={t0}
                      viewEnd={t1}
                      now={snapshot.now}
                      probSide={side}
                      height={340}
                      priceSeries={priceSeries}
                      markets={markets}
                      liveMarketId={live}
                      focusMarketId={tradingId}
                      prob={focusProb}
                      volume={focusVolume}
                      spikes={focusSpikes}
                      onColumnActivate={open}
                    />
                    {hoverMarket && geo.width > 0 && (
                      <MarketActivityCard
                        market={hoverMarket}
                        position={hoverPos}
                        history={hoverHist}
                        volumeUsd={hoverMarket.volumeUsd}
                        bigTrades={(snapshot.spikesByMarket[hoverMarket.id] ?? []).length}
                        now={snapshot.now}
                        style={{ left: hoverX, top: 8 }}
                      />
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-sub">
                    Tip: drag the timeline to see earlier markets · double-click a market to open it.
                  </p>
                </div>
              </div>
              <div className="border-t">
                <PositionsTable />
              </div>
              {/* below lg the trade card lives in the bottom sheet; the order
                  book stacks here as a scrollable section */}
              {tradingId && (
                <div className="border-t p-4 lg:hidden">
                  <MarketDepth marketId={tradingId} />
                </div>
              )}
            </>
          )}
        </main>
        {ready && tradingId && (
          <aside className="hidden shrink-0 lg:block lg:w-[332px] lg:border-l">
            <RightRail marketId={tradingId} side={side} onSideChange={setSide} />
          </aside>
        )}
      </div>
      {ready && tradingId && (
        <MobileTradeBar marketId={tradingId} side={side} onSideChange={setSide} />
      )}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-[520px] animate-pulse flex-col gap-3 rounded-[16px] border bg-surface p-4">
      <div className="h-8 w-48 rounded bg-gray-100" />
      <div className="flex-1 rounded bg-gray-50" />
    </div>
  );
}
