"use client";
import * as React from "react";
import { Bot, ChevronDown, Download, TrendingDown, TrendingUp, User, XCircle } from "lucide-react";
import { Badge, Button, Checkbox, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cents, hhmm, signedUsd, usd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import type { Position } from "@/lib/types";

/** Deterministic hash, mirrors the seed → color trick in @/components/ui/Avatar.tsx. */
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Flavor only (see task item 5) — the "robot" view is a mocked automation
 *  lens on top of real positions, not a real automations integration (that
 *  lives at /automations, a separate workstream). Strategy label is
 *  deterministic per position so it doesn't flicker across re-renders. */
const STRATEGIES = ["Dip Buyer Strategy", "Momentum Rider Strategy", "Mean Reversion Bot"];
const strategyFor = (key: string) => STRATEGIES[hash(key) % STRATEGIES.length];

const posKey = (p: Position) => `${p.marketId}|${p.side}`;

export function PositionsTable() {
  const { positions, openOrders, tradeHistory, getMarket, sell, cancelOrder, netPnl, exposure } =
    useZoqo();
  const { signedIn, openAuth } = useProfile();
  const [tab, setTab] = React.useState("Positions");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [view, setView] = React.useState<"manual" | "robot">("manual");
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreRef = React.useRef<HTMLDivElement>(null);
  const counts: Record<string, number> = {
    Positions: positions.length,
    "Open Trades": openOrders.length,
    History: tradeHistory.length,
  };

  React.useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [moreOpen]);

  // rows keyed by `${marketId}|${side}` since Position has no id of its own
  const rows = React.useMemo(
    () =>
      positions.map((p) => {
        const m = getMarket(p.marketId);
        const cur = m ? (p.side === "up" ? m.yes : 100 - m.yes) : p.avgPrice;
        const value = p.shares * (cur / 100);
        return { p, m, cur, value, pnl: value - p.cost, key: posKey(p) };
      }),
    [positions, getMarket],
  );
  const profitable = rows.filter((r) => r.pnl > 0).map((r) => r.p);
  const losing = rows.filter((r) => r.pnl < 0).map((r) => r.p);
  const selectedPositions = rows.filter((r) => selected.has(r.key)).map((r) => r.p);

  const closeAll = (subset: Position[]) => subset.forEach((p) => sell(p.marketId, p.side));
  const closeSelected = () => {
    closeAll(selectedPositions);
    setSelected(new Set());
  };

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.key)));
  const toggleOne = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedControl
          data={["Positions", "Open Trades", "History"].map((t) => ({
            value: t,
            label: counts[t] ? `${t} ${counts[t]}` : t,
          }))}
          value={tab}
          onChange={setTab}
          size="sm"
        />
        <div className="ml-auto flex items-center gap-5">
          <span className="text-[12px] text-sub">
            Net P&L{" "}
            <b className={cn("nums", netPnl >= 0 ? "text-green-500" : "text-red-500")}>
              {signedUsd(netPnl)}
            </b>
          </span>
          <span className="text-[12px] text-sub">
            Exposure <b className="text-ink nums">{usd(exposure)}</b>
          </span>
          {/* manual/automation view toggle — mocked lens, see STRATEGIES note above */}
          <div className="inline-flex items-center rounded-full border bg-surface p-0.5">
            <button
              title="Manual view"
              onClick={() => setView("manual")}
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full transition-colors",
                view === "manual" ? "bg-gray-900 text-white" : "text-sub hover:bg-gray-100",
              )}
            >
              <User size={13} />
            </button>
            <button
              title="Automation view"
              onClick={() => setView("robot")}
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full transition-colors",
                view === "robot" ? "bg-gray-900 text-white" : "text-sub hover:bg-gray-100",
              )}
            >
              <Bot size={13} />
            </button>
          </div>
        </div>
      </div>

      {tab === "Open Trades" && <OpenTrades orders={openOrders} onCancel={cancelOrder} />}
      {tab === "History" && <HistoryView entries={tradeHistory} />}

      {tab === "Positions" &&
        (positions.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-sub">
            {signedIn ? (
              "No open positions yet. Pick a market and trade Up or Down."
            ) : (
              <>
                No open positions yet.{" "}
                <button onClick={openAuth} className="font-semibold text-purple-600 hover:underline">
                  Sign up
                </button>{" "}
                to start trading — pick Up or Down on any market above.
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="soft"
                color="gray"
                leftIcon={<XCircle size={13} />}
                disabled={positions.length === 0}
                onClick={() => closeAll(positions)}
              >
                Close All Positions
              </Button>
              <Button
                size="sm"
                variant="soft"
                color="up"
                leftIcon={<TrendingUp size={13} />}
                disabled={profitable.length === 0}
                onClick={() => closeAll(profitable)}
              >
                Close All Profitable
              </Button>
              <Button
                size="sm"
                variant="soft"
                color="down"
                leftIcon={<TrendingDown size={13} />}
                disabled={losing.length === 0}
                onClick={() => closeAll(losing)}
              >
                Close All Losing
              </Button>

              <div ref={moreRef} className="relative">
                <Button
                  size="sm"
                  variant="outline"
                  color="gray"
                  rightIcon={<ChevronDown size={13} />}
                  onClick={() => setMoreOpen((o) => !o)}
                >
                  More Actions
                </Button>
                {moreOpen && (
                  <div className="animate-[zoqo-pop_0.12s_ease-out] absolute left-0 z-20 mt-1.5 w-48 rounded-[12px] border border-line bg-surface p-1 shadow-e3">
                    <button
                      disabled={selectedPositions.length === 0}
                      onClick={() => {
                        closeSelected();
                        setMoreOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] text-ink hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <XCircle size={14} className="text-sub" />
                      Close selected ({selectedPositions.length})
                    </button>
                    <button
                      onClick={() => setMoreOpen(false)}
                      className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] text-ink hover:bg-gray-100"
                    >
                      <Download size={14} className="text-sub" />
                      Export positions
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[900px] text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] font-medium text-sub">
                    <th className="w-8 pb-2 pl-1">
                      <Checkbox checked={allChecked} onChange={toggleAll} size="sm" />
                    </th>
                    {[
                      "Event",
                      ...(view === "robot" ? ["Automation"] : []),
                      "Position",
                      "Shares",
                      "Avg Buy",
                      "Total Buy",
                      "Current",
                      "Value",
                      "To win",
                      "PNL",
                      "",
                    ].map((h) => (
                      <th key={h} className="pb-2 font-medium first:pl-1">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="nums">
                  {rows.map(({ p, m, cur, value, pnl, key }) => {
                    const pnlPct = p.cost ? (pnl / p.cost) * 100 : 0;
                    return (
                      <tr key={key} className="border-t">
                        <td className="py-2.5 pl-1">
                          <Checkbox checked={selected.has(key)} onChange={() => toggleOne(key)} size="sm" />
                        </td>
                        <td className="py-2.5 font-semibold text-ink">
                          BTC {m?.strike ? `${p.side === "up" ? "≥" : "<"} ${m.strike.toLocaleString()}` : ""}{" "}
                          <span className="font-normal text-sub">
                            @ {m?.label}
                            {m?.status === "settled" ? " · closed" : m?.status === "live" ? " · live" : ""}
                          </span>
                        </td>
                        {view === "robot" && (
                          <td className="max-w-[160px] truncate text-ink" title={strategyFor(key)}>
                            {strategyFor(key)}
                          </td>
                        )}
                        <td>
                          <Badge color={p.side === "up" ? "up" : "down"} size="sm">
                            {p.side === "up" ? "Up" : "Down"}
                          </Badge>
                        </td>
                        <td>{p.shares.toLocaleString()}</td>
                        <td>{cents(p.avgPrice)}</td>
                        <td>{usd(p.cost)}</td>
                        <td>{cents(cur)}</td>
                        <td>{usd(value)}</td>
                        <td className="font-semibold text-ink">{usd(p.shares)}</td>
                        <td className={cn("font-semibold", pnl >= 0 ? "text-green-500" : "text-red-500")}>
                          {signedUsd(pnl)} ({pnlPct >= 0 ? "+" : ""}
                          {pnlPct.toFixed(1)}%)
                        </td>
                        <td className="pr-1 text-right">
                          <Button size="xs" variant="soft" color="gray" onClick={() => sell(p.marketId, p.side)}>
                            Sell
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ))}
    </div>
  );
}

function OpenTrades({
  orders,
  onCancel,
}: {
  orders: import("@/lib/types").OpenOrder[];
  onCancel: (id: string) => void;
}) {
  if (orders.length === 0)
    return (
      <div className="py-10 text-center text-[13px] text-sub">
        No working orders. Limit orders you place will rest here until filled.
      </div>
    );
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[680px] text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] font-medium text-sub">
            {["Event", "Side", "Shares", "Limit", "Filled", "Placed", "Status", ""].map((h) => (
              <th key={h} className="pb-2 font-medium first:pl-1">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="nums">
          {orders.map((o) => (
            <tr key={o.id} className="border-t">
              <td className="py-2.5 pl-1 font-semibold text-ink">
                BTC ≥ {o.strike.toLocaleString()}{" "}
                <span className="font-normal text-sub">@ {o.label}</span>
              </td>
              <td>
                <Badge color={o.side === "up" ? "up" : "down"} size="sm">
                  {o.side === "up" ? "Up" : "Down"}
                </Badge>
              </td>
              <td>{o.shares.toLocaleString()}</td>
              <td>{cents(o.limitPrice)}</td>
              <td>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-purple-500" style={{ width: `${o.filledPct}%` }} />
                  </div>
                  <span className="text-[11px] text-sub">{o.filledPct}%</span>
                </div>
              </td>
              <td className="text-sub">{hhmm(o.placedAt)}</td>
              <td>
                <Badge color={o.status === "partial" ? "gold" : "blue"} size="sm">
                  {o.status === "partial" ? "Partial" : "Working"}
                </Badge>
              </td>
              <td className="pr-1 text-right">
                <Button size="xs" variant="soft" color="gray" onClick={() => onCancel(o.id)}>
                  Cancel
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryView({ entries }: { entries: import("@/lib/types").HistoryEntry[] }) {
  if (entries.length === 0)
    return (
      <div className="py-10 text-center text-[13px] text-sub">
        No settled trades yet. Closed and resolved positions show here.
      </div>
    );
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[680px] text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] font-medium text-sub">
            {["Event", "Side", "Shares", "Entry", "Exit", "Result", "P&L", "Closed"].map((h) => (
              <th key={h} className="pb-2 font-medium first:pl-1">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="nums">
          {entries.map((e) => (
            <tr key={e.id} className="border-t">
              <td className="py-2.5 pl-1 font-semibold text-ink">
                BTC ≥ {e.strike.toLocaleString()}{" "}
                <span className="font-normal text-sub">@ {e.label}</span>
              </td>
              <td>
                <Badge color={e.side === "up" ? "up" : "down"} size="sm">
                  {e.side === "up" ? "Up" : "Down"}
                </Badge>
              </td>
              <td>{e.shares.toLocaleString()}</td>
              <td>{cents(e.entryPrice)}</td>
              <td>{cents(e.exitPrice)}</td>
              <td>
                <Badge
                  color={e.result === "won" ? "up" : e.result === "lost" ? "down" : "gray"}
                  size="sm"
                >
                  {e.result === "won" ? "Won" : e.result === "lost" ? "Lost" : "Closed"}
                </Badge>
              </td>
              <td className={cn("font-semibold", e.pnl >= 0 ? "text-green-500" : "text-red-500")}>
                {signedUsd(e.pnl)}
              </td>
              <td className="text-sub">{hhmm(e.closedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
