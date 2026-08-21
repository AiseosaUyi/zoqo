"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Gift } from "lucide-react";
import { SegmentedControl } from "@/components/ui";
import { useZoqo } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { useAutomations } from "@/lib/automations";
import { useDepositCooldown } from "@/lib/useDepositCooldown";
import { MARKET_DURATIONS } from "@/lib/timeframe";
import { DepositModal } from "./DepositModal";
import { ProfileMenu } from "./ProfileMenu";
import {
  HeaderAuthButtons,
  HeaderBell,
  HeaderDepositButton,
  HeaderLogo,
  HeaderMobileNav,
  HeaderMobileNavTrigger,
  HeaderNav,
  HeaderStats,
} from "./HeaderChrome";

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
  const [navOpen, setNavOpen] = React.useState(false);
  const { locked, remainingH } = useDepositCooldown(nextDepositAt);
  const unread = settlements.length;

  return (
    <header className="sticky top-0 z-30 grid h-[60px] grid-cols-[1fr_auto_1fr] items-center gap-2 border-b bg-surface/90 px-3 backdrop-blur-md sm:gap-3 sm:px-4">
      {/* Left: nav trigger/logo/market context controls. min-w-0 so this
          column can shrink instead of forcing the grid wider than the
          viewport when everything (BTC selector + duration switcher) is
          visible at once. */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <HeaderMobileNavTrigger onClick={() => setNavOpen(true)} breakpoint="lg" />
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
      </div>

      {/* Center: Market/Terminal/Learn/Leaderboard/Automations. A real grid
          track (not absolute positioning) — the left/right columns are each
          `1fr`, so this always lands in the true center of the header AND
          can never overlap either side, unlike the old absolute-positioned
          version which did once the nav grew from 2 links to 5. Active link
          is derived from the route inside HeaderNav itself. */}
      <HeaderNav activeAutomations={activeAutomations} visibleFrom="lg" />

      {/* Right: account cluster. min-w-0 + justify-end so it can shrink from
          its own edge inward rather than colliding with the center nav. */}
      <div className="flex min-w-0 items-center justify-end gap-3">
        {ready && (
          <Link
            href="/referrals"
            aria-label="Rewards & referrals"
            title="Rewards & referrals"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-100 hover:bg-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-1"
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

        {ready && (signedIn ? (
          <>
            <HeaderBell unread={unread} />
            <ProfileMenu />
          </>
        ) : (
          <HeaderAuthButtons onOpenAuth={openAuth} />
        ))}
      </div>
      {/* live BTC ticker tucked for accessibility */}
      <span className="sr-only">BTC {btc ?? "—"}</span>
      <HeaderMobileNav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        activeAutomations={activeAutomations}
        signedIn={!!signedIn}
        portfolioValue={signedIn ? portfolioValue : undefined}
        cash={signedIn ? cash : undefined}
        onOpenAuth={openAuth}
      />
      {signedIn && <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />}
    </header>
  );
}
