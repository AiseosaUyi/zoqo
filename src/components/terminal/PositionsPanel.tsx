"use client";
import { useTerminal, type TerminalPosition } from "@/lib/terminalStore";
import { ASSET_BY_ID } from "@/lib/assets";
import { signedUsd } from "@/lib/format";
import { Button, Tabs } from "@/components/ui";
import { useState } from "react";

export function PositionsPanel({ prices }: { prices: Record<string, number | null> }) {
  const { positions, history, closePosition } = useTerminal();
  const [tab, setTab] = useState("open");

  return (
    <div className="flex h-full flex-col">
      <Tabs
        value={tab}
        onChange={setTab}
        data={[
          { value: "open", label: `Open (${positions.length})` },
          { value: "history", label: "History" },
        ]}
      />
      <div className="flex-1 overflow-y-auto">
        {tab === "open" ? (
          positions.length === 0 ? (
            <EmptyState text="No open positions yet — place a trade from the ticket." />
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-surface text-left text-sub">
                <tr>
                  <th className="px-3 py-2 font-semibold">Symbol</th>
                  <th className="px-3 py-2 font-semibold">Side</th>
                  <th className="px-3 py-2 font-semibold">Qty</th>
                  <th className="px-3 py-2 font-semibold">Entry</th>
                  <th className="px-3 py-2 font-semibold">Mark</th>
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
          )
        ) : history.length === 0 ? (
          <EmptyState text="Closed trades will show up here." />
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-surface text-left text-sub">
              <tr>
                <th className="px-3 py-2 font-semibold">Symbol</th>
                <th className="px-3 py-2 font-semibold">Side</th>
                <th className="px-3 py-2 font-semibold">Entry</th>
                <th className="px-3 py-2 font-semibold">Exit</th>
                <th className="px-3 py-2 font-semibold">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold">{ASSET_BY_ID[h.assetId]?.symbol ?? h.assetId}</td>
                  <td className="px-3 py-2 capitalize">{h.side}</td>
                  <td className="px-3 py-2 nums">{h.entryPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 nums">{h.exitPrice.toFixed(2)}</td>
                  <td className={`px-3 py-2 nums font-bold ${h.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {signedUsd(h.pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
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
  const pnl = mark ? (p.side === "long" ? (mark - p.entryPrice) * p.qty : (p.entryPrice - mark) * p.qty) : 0;
  return (
    <tr className="border-t border-line">
      <td className="px-3 py-2 font-semibold">{ASSET_BY_ID[p.assetId]?.symbol ?? p.assetId}</td>
      <td className={`px-3 py-2 capitalize ${p.side === "long" ? "text-green-600" : "text-red-600"}`}>{p.side}</td>
      <td className="px-3 py-2 nums">{p.qty.toFixed(6)}</td>
      <td className="px-3 py-2 nums">{p.entryPrice.toFixed(2)}</td>
      <td className="px-3 py-2 nums">{mark ? mark.toFixed(2) : "—"}</td>
      <td className={`px-3 py-2 nums font-bold ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>{signedUsd(pnl)}</td>
      <td className="px-3 py-2">
        <Button size="xs" variant="outline" color="gray" onClick={onClose} disabled={!mark}>
          Close
        </Button>
      </td>
    </tr>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-6 text-center text-[13px] text-sub">{text}</div>;
}
