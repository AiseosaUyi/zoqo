"use client";
import { Badge, Button, Card } from "@/components/ui";
import { hhmm } from "@/lib/format";
import { useZoqo } from "@/lib/store";

export function OpenOrdersTab() {
  const { openOrders, getMarket, cancelOrder } = useZoqo();

  return (
    <Card padding="none">
      {openOrders.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-sub">
          No working orders. Limit orders you place will rest here until filled.
        </div>
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="border-b text-left text-[11px] font-medium text-sub">
                {["Event", "Type", "Trigger", "Expires", "Amount", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="nums">
              {openOrders.map((o) => {
                const m = getMarket(o.marketId);
                return (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-ink">
                      BTC ≥ {o.strike.toLocaleString()} <span className="font-normal text-sub">@ {o.label}</span>
                    </td>
                    <td className="px-4">
                      <Badge color="blue" size="sm">
                        Limit
                      </Badge>
                    </td>
                    <td className="px-4">
                      <div className="flex items-center gap-1.5">
                        <Badge color={o.side === "up" ? "up" : "down"} size="sm">
                          Buy {o.side === "up" ? "Up" : "Down"}
                        </Badge>
                        <span className="text-ink">≤ {o.limitPrice.toFixed(1)}¢</span>
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-sub">Triggers at or below</div>
                    </td>
                    <td className="px-4 text-sub">
                      {m ? hhmm(m.closeTime) : "—"}
                      {m?.status === "settled" && <div className="text-[10.5px]">Market closed</div>}
                    </td>
                    <td className="px-4">{o.shares.toLocaleString()} Shares</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="xs" variant="soft" color="gray" onClick={() => cancelOrder(o.id)}>
                        Cancel
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
