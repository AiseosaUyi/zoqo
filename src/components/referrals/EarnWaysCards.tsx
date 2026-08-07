"use client";
import * as React from "react";
import Link from "next/link";
import { BarChart3, Copy, Users } from "lucide-react";
import { Badge, Card, Progress } from "@/components/ui";
import { usd, usdCompact } from "@/lib/format";
import type { ReferralData } from "@/lib/referrals";
import { useCopyToClipboard } from "@/lib/referrals";

export function EarnWaysCards({ data }: { data: ReferralData }) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card padding="lg">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-purple-50 text-purple-600">
              <Users size={18} />
            </span>
            <div>
              <div className="text-[15px] font-bold text-ink">Invite traders</div>
              <div className="text-[12px] text-sub">Referral Program</div>
            </div>
          </div>
          <Badge color="brand" variant="soft">
            Tier {data.referralTier.idx + 1}
          </Badge>
        </div>

        <div className="mt-4 flex items-end gap-4">
          <span className="text-[32px] font-black leading-none text-purple-600 nums">
            {data.referralPct}%
          </span>
          <div className="flex items-center gap-3 pb-0.5">
            <Metric value={usd(data.totalEarnedReferrals)} label="Earned" />
            <span className="h-8 w-px bg-line" />
            <Metric value={String(data.activeReferees)} label="Referees" />
          </div>
        </div>

        <TierProgressBar
          color="brand"
          progress={data.referralTier}
          nextLabel={
            data.referralTier.isMax
              ? "Max tier reached"
              : `Invite ${data.referralTier.remaining} more to reach Tier ${data.referralTier.idx + 2} · ${
                  [10, 20, 30, 40, 50, 60, 70, 80][data.referralTier.idx + 1]
                }%`
          }
        />

        <button
          onClick={() => copy(data.link)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-gray-50"
        >
          <Copy size={14} />
          {copied ? "Link copied" : "Share Invite Link"}
        </button>
      </Card>

      <Card padding="lg">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-green-100 text-green-700">
              <BarChart3 size={18} />
            </span>
            <div>
              <div className="text-[15px] font-bold text-ink">Trade more</div>
              <div className="text-[12px] text-sub">Fee Rebate Program</div>
            </div>
          </div>
          <Badge color="up" variant="soft">
            Tier {data.rebateTier.idx + 1}
          </Badge>
        </div>

        <div className="mt-4 flex items-end gap-4">
          <span className="text-[32px] font-black leading-none text-green-600 nums">
            {data.rebatePct}%
          </span>
          <div className="flex items-center gap-3 pb-0.5">
            <Metric value={usd(data.totalEarnedRebates)} label="Rebated" />
            <span className="h-8 w-px bg-line" />
            <Metric value={usdCompact(data.monthlyVolume)} label="Volume" />
          </div>
        </div>

        <TierProgressBar
          color="up"
          progress={data.rebateTier}
          nextLabel={
            data.rebateTier.isMax
              ? "Max tier reached"
              : `Trade ${usdCompact(data.rebateTier.remaining)} more to reach Tier ${
                  data.rebateTier.idx + 2
                } · ${[10, 20, 30, 40, 50, 60, 70, 80][data.rebateTier.idx + 1]}%`
          }
        />

        <Link
          href="/trade"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-gray-50"
        >
          Start Trading
        </Link>
      </Card>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[14px] font-bold text-ink nums">{value}</div>
      <div className="text-[11px] text-sub">{label}</div>
    </div>
  );
}

function TierProgressBar({
  color,
  progress,
  nextLabel,
}: {
  color: "brand" | "up";
  progress: { progress: number };
  nextLabel: string;
}) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
        <span className="text-sub">{nextLabel}</span>
        <span className="font-semibold text-ink nums">{Math.round(progress.progress * 100)}%</span>
      </div>
      <Progress value={progress.progress * 100} color={color} size="md" />
    </div>
  );
}
