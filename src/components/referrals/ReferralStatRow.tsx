"use client";
import * as React from "react";
import { Info } from "lucide-react";
import { Card, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { usd, usdCompact } from "@/lib/format";
import type { ReferralData } from "@/lib/referrals";

export function ReferralStatRow({ data }: { data: ReferralData }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Active referees" value={String(data.activeReferees)} />
      <StatCard
        label="Rebate rate"
        value={`${data.rebatePct}%`}
        suffix={`Tier ${data.rebateTier.idx + 1}`}
        suffixTone="brand"
      />
      <StatCard
        label={
          <span className="inline-flex items-center gap-1">
            Pending payout
            <Tooltip label="Pending payouts are transferred to your wallet at the end of each payout period.">
              <Info size={12} className="text-sub" />
            </Tooltip>
          </span>
        }
        value={usd(data.pendingPayout)}
      />
      <StatCard label="This month" value={usdCompact(data.monthlyVolume)} suffix="Vol" suffixTone="sub" />
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  suffixTone = "sub",
}: {
  label: React.ReactNode;
  value: string;
  suffix?: string;
  suffixTone?: "sub" | "brand";
}) {
  return (
    <Card padding="md">
      <div className="text-[12px] text-sub">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[22px] font-bold text-ink nums">{value}</span>
        {suffix && (
          <span
            className={cn(
              "text-[11px] font-semibold nums",
              suffixTone === "brand" ? "text-purple-600" : "text-sub",
            )}
          >
            {suffix}
          </span>
        )}
      </div>
    </Card>
  );
}
