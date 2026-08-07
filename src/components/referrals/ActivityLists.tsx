"use client";
import * as React from "react";
import { ArrowUpRight, Percent } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { signedUsd, usd } from "@/lib/format";
import type { ActivityItem, PayoutItem } from "@/lib/referrals";

function dateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ActivityLists({ activity, payouts }: { activity: ActivityItem[]; payouts: PayoutItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card padding="lg">
        <h3 className="text-[14px] font-bold text-ink">Recent activity</h3>
        <div className="mt-3 flex flex-col gap-1">
          {activity.length === 0 && <p className="py-4 text-[12px] text-sub">No activity yet.</p>}
          {activity.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-[10px] px-1.5 py-2 hover:bg-gray-50">
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                  a.kind === "referral" ? "bg-purple-50 text-purple-600" : "bg-green-100 text-green-700",
                )}
              >
                {a.kind === "referral" ? <ArrowUpRight size={15} /> : <Percent size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{a.title}</div>
                <div className="truncate text-[11.5px] text-sub">{a.subtitle}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[13px] font-bold text-green-600 nums">{signedUsd(a.amount)}</div>
                <div className="text-[11px] text-sub nums">{dateLabel(a.ts)}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="lg">
        <h3 className="text-[14px] font-bold text-ink">Payout history</h3>
        <div className="mt-3 flex flex-col gap-1">
          {payouts.length === 0 && <p className="py-4 text-[12px] text-sub">No payouts yet.</p>}
          {payouts.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-[10px] px-1.5 py-2 hover:bg-gray-50">
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-sub nums">{p.dateLabel}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">{p.type}</span>
                  <Badge color={p.status === "Paid" ? "up" : "gold"} variant="soft" size="sm">
                    {p.status}
                  </Badge>
                </div>
              </div>
              <div className="shrink-0 text-[13px] font-bold text-ink nums">{usd(p.amount)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
