"use client";
import * as React from "react";
import { useZoqo } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { useAutomations } from "@/lib/automations";
import { useDepositCooldown } from "@/lib/useDepositCooldown";
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

/**
 * A light top nav for /settings — shares its logo/nav/deposit/stats/bell/
 * auth chrome with TopNav via @/components/trade/HeaderChrome, same
 * composition as ReferralsTopNav (see CLAUDE.md's "Shared header chrome").
 */
export function SettingsTopNav() {
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
      <HeaderMobileNavTrigger onClick={() => setNavOpen(true)} />
      <HeaderLogo />

      <HeaderNav activeAutomations={activeAutomations} className="mx-auto" />

      <div className="ml-auto flex items-center gap-3">
        {ready && signedIn && (
          <>
            <HeaderDepositButton locked={locked} remainingH={remainingH} onClick={() => setDepositOpen(true)} />
            <HeaderStats portfolioValue={portfolioValue} cash={cash} />
            <HeaderBell unread={unread} />
            <ProfileMenu />
          </>
        )}

        {ready && !signedIn && <HeaderAuthButtons onOpenAuth={openAuth} />}
      </div>

      <HeaderMobileNav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        activeAutomations={activeAutomations}
        signedIn={!!signedIn}
        portfolioValue={signedIn ? portfolioValue : undefined}
        cash={signedIn ? cash : undefined}
        onOpenAuth={openAuth}
        showPrimaryNav={false}
      />
      {signedIn && <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />}
    </header>
  );
}
