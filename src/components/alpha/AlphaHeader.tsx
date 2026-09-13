"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useZoqo } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { useAutomations } from "@/lib/automations";
import { useDepositCooldown } from "@/lib/useDepositCooldown";
import { useAlphaUnread } from "@/lib/alpha/useAlphaUnread";
import { DepositModal } from "@/components/trade/DepositModal";
import { ProfileMenu } from "@/components/trade/ProfileMenu";
import {
  HeaderAuthButtons,
  HeaderBell,
  HeaderDepositButton,
  HeaderLogo,
  HeaderMobileNav,
  HeaderMobileNavTrigger,
  HeaderNav,
  HeaderStats,
} from "@/components/trade/HeaderChrome";

/** Header for /alpha — same shared chrome (logo/nav/deposit/stats/bell/auth)
 *  every other page's header composes from HeaderChrome.tsx, matching
 *  AutomationsHeader's shape exactly since /alpha sits alongside
 *  /automations conceptually (both are "set it and forget it" trading
 *  surfaces). In `NAV_ITEMS` (added phase-7-finish §1) so it's reachable
 *  from every header, not just direct URL. */
export function AlphaHeader() {
  const { portfolioValue, cash, nextDepositAt, settlements } = useZoqo();
  const { ready, signedIn, openAuth } = useProfile();
  const { automations } = useAutomations();
  const activeAutomations = automations.filter((a) => a.enabled).length;
  const alphaUnread = useAlphaUnread(!!signedIn);
  const [depositOpen, setDepositOpen] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);
  const { locked, remainingH } = useDepositCooldown(nextDepositAt);
  const unread = settlements.length;

  return (
    <header className="sticky top-0 z-30 border-b bg-surface/90 backdrop-blur-md">
      <div className="flex h-[60px] items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <HeaderLogo />

        <HeaderNav activeAutomations={activeAutomations} alphaUnread={alphaUnread} className="ml-2" />

        <div className="ml-auto flex items-center gap-3">
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

          <HeaderMobileNavTrigger onClick={() => setNavOpen(true)} />
        </div>
      </div>

      <HeaderMobileNav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        activeAutomations={activeAutomations}
        alphaUnread={alphaUnread}
        signedIn={!!signedIn}
        portfolioValue={signedIn ? portfolioValue : undefined}
        cash={signedIn ? cash : undefined}
        onOpenAuth={openAuth}
      />
      {signedIn && <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />}
    </header>
  );
}

/** Row below the header carrying the "← Back" link, matching Automations'. */
export function AlphaBackRow() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-4 sm:px-6">
      <Link href="/terminal" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-sub hover:text-ink">
        <ArrowLeft size={15} /> Back
      </Link>
    </div>
  );
}
