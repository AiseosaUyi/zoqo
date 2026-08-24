"use client";
import * as React from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { useReferralData } from "@/lib/referrals";
import { ReferralsTopNav } from "@/components/referrals/ReferralsTopNav";
import { ReferralHero } from "@/components/referrals/ReferralHero";
import { ReferralStatRow } from "@/components/referrals/ReferralStatRow";
import { EarnWaysCards } from "@/components/referrals/EarnWaysCards";
import { EarningTierLadder } from "@/components/referrals/EarningTierLadder";
import { ActivityLists } from "@/components/referrals/ActivityLists";
import { MOBILE_NAV_SAFE_PADDING } from "@/components/trade/MobileBottomNav";
import { cn } from "@/lib/cn";

export default function ReferralsPage() {
  const { ready, signedIn, openAuth } = useProfile();
  const data = useReferralData();

  return (
    <div className={cn("min-h-screen", MOBILE_NAV_SAFE_PADDING)}>
      <ReferralsTopNav />

      {!ready && (
        <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-8 sm:px-6">
          <div className="h-40 animate-pulse rounded-[16px] bg-gray-100" />
        </div>
      )}

      {ready && !signedIn && (
        <div className="mx-auto flex max-w-[1180px] flex-col items-center px-4 pb-16 pt-16 text-center sm:px-6">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-purple-50 text-purple-600">
            <Gift size={26} />
          </span>
          <h1 className="mt-4 text-[22px] font-bold text-ink">Sign up to get your referral link</h1>
          <p className="mt-1.5 max-w-[420px] text-[13.5px] text-sub">
            Create a ZOQO account to get a personal referral link and start earning a share of the
            fees your referees generate — plus rebates on your own trading.
          </p>
          <Button color="brand" size="lg" className="mt-5" onClick={openAuth}>
            Sign up
          </Button>
        </div>
      )}

      {ready && signedIn && data && (
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-6">
          <div>
            <h1 className="text-[22px] font-bold text-ink sm:text-[26px]">Rewards</h1>
            <p className="mt-0.5 text-[13px] text-sub">Invite traders, trade more, and earn together</p>
          </div>

          <ReferralHero data={data} />
          <ReferralStatRow data={data} />

          <div>
            <h2 className="text-[16px] font-bold text-ink">Two ways to earn</h2>
            <p className="mt-0.5 text-[12.5px] text-sub">
              They stack — invite traders and trade more at the same time
            </p>
            <div className="mt-3">
              <EarnWaysCards data={data} />
            </div>
          </div>

          <div className="rounded-[16px] border bg-surface p-5">
            <h2 className="text-[16px] font-bold text-ink">Earning tiers</h2>
            <p className="mt-0.5 text-[12.5px] text-sub">Once earned, always kept</p>
            <div className="mt-4 flex flex-col gap-5">
              <EarningTierLadder
                title="Referrals · Builder-fee share"
                unit=""
                currentIdx={data.referralTier.idx}
                theme="brand"
              />
              <EarningTierLadder
                title="Rebates · Monthly volume"
                unit="K"
                currentIdx={data.rebateTier.idx}
                theme="up"
              />
            </div>
          </div>

          <ActivityLists activity={data.activity} payouts={data.payouts} />
        </div>
      )}
    </div>
  );
}
