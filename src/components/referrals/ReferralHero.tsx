"use client";
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";
import type { ReferralData } from "@/lib/referrals";
import { useCopyToClipboard } from "@/lib/referrals";

export function ReferralHero({ data }: { data: ReferralData }) {
  const { copied, failed, copy } = useCopyToClipboard();

  return (
    <div className="relative overflow-hidden rounded-[16px] bg-gradient-to-br from-purple-500 to-purple-700 p-5 text-white sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-[440px]">
          <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold tracking-wide text-white/90 uppercase">
            Your referral link
          </span>
          <h1 className="mt-3 text-[24px] font-black leading-tight sm:text-[28px]">
            Share ZOQO. Earn up to 80%.
          </h1>
          <p className="mt-1.5 text-[13px] text-white/80">
            Every trader you bring pays you a share of their builder fees — for as long as they
            trade.
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-[12px] bg-white/15 p-1.5 pl-4">
            <span className="min-w-0 flex-1 truncate text-[14px] font-bold nums select-all">
              {data.link}
            </span>
            <button
              onClick={() => copy(data.link)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors",
                copied ? "bg-green-500 text-white" : "bg-white text-purple-700 hover:bg-white/90",
              )}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {failed && (
            <p className="mt-1.5 text-[12px] font-medium text-white/90">
              Couldn&apos;t copy automatically — the link above is selected, copy it manually.
            </p>
          )}
        </div>

        <div className="text-left sm:text-right">
          <div className="text-[12px] text-white/70">Total earned all time</div>
          <div className="mt-1 text-[34px] font-black leading-none nums">
            {usd(data.totalEarnedAllTime)}
          </div>
          <div className="mt-3 flex items-center gap-4 sm:justify-end">
            <div>
              <div className="text-[15px] font-bold nums">{usd(data.totalEarnedReferrals)}</div>
              <div className="text-[11px] text-white/70">referrals</div>
            </div>
            <div>
              <div className="text-[15px] font-bold nums">{usd(data.totalEarnedRebates)}</div>
              <div className="text-[11px] text-white/70">rebates</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
