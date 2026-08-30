"use client";
import { useState } from "react";
import { Clock3, GitBranch, Percent, Timer } from "lucide-react";
import { useTerminal, type TerminalPosition, type TerminalOrder } from "@/lib/terminalStore";
import { useTradeJournal } from "@/lib/tradeJournal";
import { ASSET_BY_ID } from "@/lib/assets";
import { signedUsd, usd, price } from "@/lib/format";
import { Badge, Button, EmptyState, Stat, Tabs } from "@/components/ui";

const TABS = [
  { value: "balances", label: "Balances" },
  { value: "open", label: "Positions" },
  { value: "orders", label: "Open Orders" },
  { value: "twap", label: "TWAP" },
  { value: "conditional", label: "Conditional" },
  { value: "funding", label: "Funding History" },
  { value: "orderHistory", label: "Order History" },
  { value: "tradeHistory", label: "Trade History" },
];

/** MT5/perp-terminal-style tabbed bottom panel — replaces the old single-tab
 *  PositionsPanel. Each tab is honestly sourced: real data where ZOQO has it
 *  (Balances/Positions/Trade History), an explained empty state where it
 *  doesn't (TWAP/Conditional/Funding History have no ZOQO equivalent; Open
 *  Orders/Order History are empty until Phase 4 adds real Limit orders) —
 *  never a fabricated table standing in for data that doesn't exist. */
export function DataTablesPanel({
  prices,
  cash,
  equity,
  unrealizedPnl,
}: {
  prices: Record<string, number | null>;
  cash: number;
  equity: number;
  unrealizedPnl: number;
}) {
  const [tab, setTab] = useState("balances");
  const { positions, closePosition, orders, cancelOrder } = useTerminal();
  const inPositions = positions.reduce((s, p) => s + p.qty * p.entryPrice, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="overflow-x-auto scroll-thin">
        <Tabs
          value={tab}
          onChange={setTab}
          size="sm"
          data={TABS.map((t) => {
            if (t.value === "open") return { ...t, label: `Positions (${positions.length})` };
            if (t.value === "orders") return { ...t, label: `Open Orders (${orders.length})` };
            return t;
          })}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "balances" && (
          <div className="flex flex-wrap items-center gap-6 p-4">
            <Stat label="Cash" value={usd(cash)} />
            <Stat label="In Positions" value={usd(inPositions)} />
            <Stat label="Equity" value={usd(equity)} valueColor={equity >= cash ? "up" : "down"} />
            <Stat
              label="Unrealized P&L"
              value={signedUsd(unrealizedPnl)}
              valueColor={unrealizedPnl >= 0 ? "up" : "down"}
            />
          </div>
        )}

        {tab === "open" &&
          (positions.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No open positions"
              description="Place a trade from the order ticket and it'll show up here with live mark-to-market P&L."
              className="m-4 py-8"
            />
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-surface text-left text-sub">
                <tr>
                  <th className="px-3 py-2 font-semibold">Symbol</th>
                  <th className="px-3 py-2 font-semibold">Side</th>
                  <th className="px-3 py-2 font-semibold">Qty</th>
                  <th className="px-3 py-2 font-semibold">Entry</th>
                  <th className="px-3 py-2 font-semibold">Mark</th>
                  <th className="px-3 py-2 font-semibold">SL</th>
                  <th className="px-3 py-2 font-semibold">TP</th>
                  <th className="px-3 py-2 font-semibold">P&amp;L</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <PositionRow
                    key={p.id}
                    p={p}
                    mark={prices[p.assetId] ?? null}
                    onClose={() => prices[p.assetId] && closePosition(p.id, prices[p.assetId]!)}
                  />
                ))}
              </tbody>
            </table>
          ))}

        {tab === "orders" &&
          (orders.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No open orders"
              description="Market orders fill immediately, so there's nothing to rest here — place a Limit order from the ticket to see one appear."
              className="m-4 py-8"
            />
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-surface text-left text-sub">
                <tr>
                  <th className="px-3 py-2 font-semibold">Symbol</th>
                  <th className="px-3 py-2 font-semibold">Side</th>
                  <th className="px-3 py-2 font-semibold">Qty</th>
                  <th className="px-3 py-2 font-semibold">Limit Price</th>
                  <th className="px-3 py-2 font-semibold">Reduce Only</th>
                  <th className="px-3 py-2 font-semibold">Placed</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <OrderRow key={o.id} o={o} onCancel={() => cancelOrder(o.id)} />
                ))}
              </tbody>
            </table>
          ))}

        {tab === "twap" && (
          <EmptyState
            icon={Timer}
            title="Not available"
            description="TWAP (time-weighted execution) isn't part of this paper terminal — there's no batch-execution engine behind it."
            className="m-4 py-8"
          />
        )}

        {tab === "conditional" && (
          <EmptyState
            icon={GitBranch}
            title="Not available"
            description="Standalone conditional orders aren't modeled here. Stop-loss/take-profit exist, but only attached to an open position — see the Positions tab."
            className="m-4 py-8"
          />
        )}

        {tab === "funding" && (
          <EmptyState
            icon={Percent}
            title="Not applicable"
            description="This is spot-style paper trading, not perpetual futures — there's no funding rate to accrue or display."
            className="m-4 py-8"
          />
        )}

        {tab === "orderHistory" && (
          <EmptyState
            icon={Clock3}
            title="No separate order log"
            description="A filled Limit order lands in Trade History like any other trade — there's no separate pending→filled log kept here, and a cancelled order isn't retained once removed from Open Orders."
            className="m-4 py-8"
          />
        )}

        {tab === "tradeHistory" && <TradeHistoryTable />}
      </div>
    </div>
  );
}

function TradeHistoryTable() {
  const { filtered } = useTradeJournal("terminal");
  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={Clock3}
        title="No closed trades yet"
        description="Trades you close on this terminal show up here — the same unified log as your profile's Journal tab."
        className="m-4 py-8"
      />
    );
  }
  return (
    <table className="w-full text-[12px]">
      <thead className="sticky top-0 bg-surface text-left text-sub">
        <tr>
          <th className="px-3 py-2 font-semibold">Symbol</th>
          <th className="px-3 py-2 font-semibold">Side</th>
          <th className="px-3 py-2 font-semibold">Size</th>
          <th className="px-3 py-2 font-semibold">Date</th>
          <th className="px-3 py-2 font-semibold">P&amp;L</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((e) => (
          <tr key={e.id} className="border-t border-line">
            <td className="px-3 py-2 font-semibold">{e.title}</td>
            <td className="px-3 py-2">
              <Badge color={e.sideColor} size="sm">
                {e.sideLabel}
              </Badge>
            </td>
            <td className="px-3 py-2 nums">{e.sizeLabel}</td>
            <td className="px-3 py-2 text-sub">
              {new Date(e.closedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </td>
            <td className={`px-3 py-2 nums font-bold ${e.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              {signedUsd(e.pnl)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrderRow({ o, onCancel }: { o: TerminalOrder; onCancel: () => void }) {
  const decimals = ASSET_BY_ID[o.assetId]?.decimals ?? 2;
  return (
    <tr className="border-t border-line">
      <td className="px-3 py-2 font-semibold">{ASSET_BY_ID[o.assetId]?.symbol ?? o.assetId}</td>
      <td className={`px-3 py-2 capitalize ${o.side === "long" ? "text-green-600" : "text-red-600"}`}>{o.side}</td>
      <td className="px-3 py-2 nums">{o.qty.toFixed(6)}</td>
      <td className="px-3 py-2 nums">{price(o.limitPrice, decimals)}</td>
      <td className="px-3 py-2 text-sub">{o.reduceOnly ? "Yes" : "—"}</td>
      <td className="px-3 py-2 text-sub">
        {new Date(o.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
      </td>
      <td className="px-3 py-2">
        <Button size="xs" variant="outline" color="gray" onClick={onCancel}>
          Cancel
        </Button>
      </td>
    </tr>
  );
}

function PositionRow({
  p,
  mark,
  onClose,
}: {
  p: TerminalPosition;
  mark: number | null;
  onClose: () => void;
}) {
  const decimals = ASSET_BY_ID[p.assetId]?.decimals ?? 2;
  const pnl = mark ? (p.side === "long" ? (mark - p.entryPrice) * p.qty : (p.entryPrice - mark) * p.qty) : 0;
  return (
    <tr className="border-t border-line">
      <td className="px-3 py-2 font-semibold">{ASSET_BY_ID[p.assetId]?.symbol ?? p.assetId}</td>
      <td className={`px-3 py-2 capitalize ${p.side === "long" ? "text-green-600" : "text-red-600"}`}>{p.side}</td>
      <td className="px-3 py-2 nums">{p.qty.toFixed(6)}</td>
      <td className="px-3 py-2 nums">{price(p.entryPrice, decimals)}</td>
      <td className="px-3 py-2 nums">{mark ? price(mark, decimals) : "—"}</td>
      <td className="px-3 py-2 nums text-red-600">{p.stopLoss != null ? price(p.stopLoss, decimals) : "—"}</td>
      <td className="px-3 py-2 nums text-green-600">{p.takeProfit != null ? price(p.takeProfit, decimals) : "—"}</td>
      <td className={`px-3 py-2 nums font-bold ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>{signedUsd(pnl)}</td>
      <td className="px-3 py-2">
        <Button size="xs" variant="outline" color="gray" onClick={onClose} disabled={!mark}>
          Close
        </Button>
      </td>
    </tr>
  );
}
