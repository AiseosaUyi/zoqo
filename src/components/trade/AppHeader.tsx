"use client";
import * as React from "react";
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

/** Shared header for the non-BTC-specific pages (Terminal, Learn,
 *  Leaderboard) — composed from the same HeaderChrome pieces TopNav /
 *  AutomationsHeader / ProfileTopNav / ReferralsTopNav already use, per the
 *  "one shared chrome, each page composes it" rule in CLAUDE.md. Doesn't
 *  carry TopNav's BTC/duration selector since it isn't scoped to one asset.
 *  Active nav state is derived from the route inside HeaderNav — no `active`
 *  prop to thread or forget here. */
export function AppHeader() {
  const { portfolioValue, cash, nextDepositAt, settlements } = useZoqo();
  const { ready, signedIn, openAuth } = useProfile();
  const { automations } = useAutomations();
  const activeAutomations = automations.filter((a) => a.enabled).length;
  const [depositOpen, setDepositOpen] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);
  const { locked, remainingH } = useDepositCooldown(nextDepositAt);
  const unread = settlements.length;

  return (
    <header className="sticky top-0 z-30 flex h-[56px] items-center gap-3 border-b bg-surface/90 px-4 backdrop-blur-md">
      <HeaderLogo />
      <HeaderNav activeAutomations={activeAutomations} visibleFrom="sm" className="ml-4" />
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
