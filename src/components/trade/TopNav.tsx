"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Gift, Palette, Sparkles } from "lucide-react";
import { SegmentedControl } from "@/components/ui";
import { useZoqo } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { useAutomations } from "@/lib/automations";
import { useDepositCooldown } from "@/lib/useDepositCooldown";
import { MARKET_DURATIONS } from "@/lib/timeframe";
import { DepositModal } from "./DepositModal";
import { ProfileMenu } from "./ProfileMenu";
import { HeaderAuthButtons, HeaderBell, HeaderDepositButton, HeaderLogo, HeaderNav, HeaderStats } from "./HeaderChrome";

export interface TopNavProps {
  showBack?: boolean;
  duration: string; // selected market duration (5m/10m/15m/30m/1h)
  onDuration: (d: string) => void;
}

export function TopNav({ showBack, duration, onDuration }: TopNavProps) {
  const { portfolioValue, cash, btc, nextDepositAt, settlements } = useZoqo();
  const { ready, signedIn, openAuth } = useProfile();
  const { automations } = useAutomations();
  const activeAutomations = automations.filter((a) => a.enabled).length;
  const [depositOpen, setDepositOpen] = React.useState(false);
  const { locked, remainingH } = useDepositCooldown(nextDepositAt);
  const unread = settlements.length;

  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b bg-surface/90 px-3 backdrop-blur-md sm:gap-3 sm:px-4 relative">
      <HeaderLogo />

      {showBack ? (
        <Link
          href="/trade"
          className="ml-2 inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-[13px] font-medium text-sub hover:bg-gray-100 hover:text-ink"
        >
          <ArrowLeft size={15} /> Back
        </Link>
      ) : (
        <button className="ml-2 inline-flex items-center gap-1.5 rounded-[8px] bg-muted px-2.5 py-1.5 text-[13px] font-semibold">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-orange-500 text-[9px] font-black text-white">
            ₿
          </span>
          BTC
          <ChevronDown size={14} className="text-sub" />
        </button>
      )}

      <SegmentedControl
        data={MARKET_DURATIONS.map((d) => ({ value: d.key, label: d.label }))}
        value={duration}
        onChange={onDuration}
        size="sm"
        className="ml-1 hidden lg:inline-flex"
      />

      {/* Market / Automations — true center of the header (absolute, not
          flex-centered-in-leftover-space) so it lands in the same spot
          regardless of how wide the left/right content is on any given page.
          "Market" is always the active section here since TopNav only
          renders on /trade & /market/*. */}
      <HeaderNav
        activeAutomations={activeAutomations}
        active="market"
        visibleFrom="lg"
        className="absolute left-1/2 -translate-x-1/2"
      />

      <div className="ml-auto flex items-center gap-3">
        {ready && (
          <Link
            href="/referrals"
            title="Rewards & referrals"
            className="grid h-8 w-8 place-items-center rounded-full bg-gold-100 hover:bg-gold-200"
          >
            <Gift size={16} className="text-gold-700" />
          </Link>
        )}

        {ready && signedIn && (
          <>
            <HeaderDepositButton locked={locked} remainingH={remainingH} onClick={() => setDepositOpen(true)} />
            <HeaderStats portfolioValue={portfolioValue} cash={cash} />
          </>
        )}

        {ready && (
          <Link
            href="/system"
            title="Design system"
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-gray-100"
          >
            <Palette size={17} className="text-sub" />
          </Link>
        )}

        {ready && (signedIn ? (
          <>
            <HeaderBell unread={unread} />
            <ProfileMenu />
            <button className="hidden items-center gap-1 rounded-full bg-gray-900 px-3 py-1.5 text-[12px] font-bold text-white sm:inline-flex">
              <Sparkles size={13} /> AI
            </button>
          </>
        ) : (
          <HeaderAuthButtons onOpenAuth={openAuth} />
        ))}
      </div>
      {/* live BTC ticker tucked for accessibility */}
      <span className="sr-only">BTC {btc ?? "—"}</span>
      {signedIn && <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />}
    </header>
  );
}
