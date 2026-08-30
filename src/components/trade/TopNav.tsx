"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Gift } from "lucide-react";
import { useZoqo } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { useAutomations } from "@/lib/automations";
import { useDepositCooldown } from "@/lib/useDepositCooldown";
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
}

/** Same flat flex layout as AutomationsHeader/ProfileTopNav/ReferralsTopNav
 *  — this used to be the one header still on a 3-column grid (to center a
 *  wider nav + BTC badge + duration tabs), which was the actual source of
 *  "some links live in a middle column, some on the right" drift between
 *  headers. Now that /trade owns its own duration control and the BTC badge
 *  is gone (single-asset — a picker for one asset was never real UI), the
 *  nav is short enough to just sit left of the account cluster like
 *  everywhere else. */
export function TopNav({ showBack }: TopNavProps) {
  const { portfolioValue, cash, nextDepositAt, settlements } = useZoqo();
  const { ready, signedIn, openAuth } = useProfile();
  const { automations } = useAutomations();
  const activeAutomations = automations.filter((a) => a.enabled).length;
  const [depositOpen, setDepositOpen] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);
  const { locked, remainingH } = useDepositCooldown(nextDepositAt);
  const unread = settlements.length;

  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b bg-surface/90 px-3 backdrop-blur-md sm:px-4">
      <HeaderLogo />

      {showBack && (
        <Link
          href="/trade"
          className="ml-1 inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-[13px] font-medium text-sub hover:bg-gray-100 hover:text-ink"
        >
          <ArrowLeft size={15} /> Back
        </Link>
      )}

      <HeaderNav activeAutomations={activeAutomations} visibleFrom="lg" className="ml-2" />

      <div className="ml-auto flex min-w-0 items-center gap-3">
        {ready && (
          // Hidden below lg: the hamburger drawer (HeaderMobileNav, default
          // showPrimaryNav) has its own "Rewards & referrals" entry, and
          // this icon was one of the things overlapping the auth buttons in
          // the crowded mobile row — no need for both.
          <Link
            href="/referrals"
            aria-label="Rewards & referrals"
            title="Rewards & referrals"
            className="hidden h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-100 hover:bg-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-1 lg:grid"
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

        <HeaderMobileNavTrigger onClick={() => setNavOpen(true)} breakpoint="lg" />
      </div>
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
