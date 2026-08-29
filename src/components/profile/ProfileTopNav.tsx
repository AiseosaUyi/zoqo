"use client";
import * as React from "react";
import { Gift } from "lucide-react";
import { usd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { useAutomations } from "@/lib/automations";
import { useDepositCooldown } from "@/lib/useDepositCooldown";
import { cn } from "@/lib/cn";
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
 * A lighter top nav for /profile — shares its logo/nav/deposit/stats/bell/
 * auth chrome with TopNav via @/components/trade/HeaderChrome, but doesn't
 * carry the BTC/duration selector that page is tightly coupled to, and adds
 * its own claim-daily gift button in place of TopNav's rewards-link icon.
 */
export function ProfileTopNav() {
  const { portfolioValue, cash, nextDepositAt, settlements } = useZoqo();
  const { ready, signedIn, openAuth, canClaimToday, dailyBonus, claimDaily } = useProfile();
  const { automations } = useAutomations();
  const activeAutomations = automations.filter((a) => a.enabled).length;
  const [depositOpen, setDepositOpen] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);
  const [justClaimed, setJustClaimed] = React.useState(0);
  const { locked, remainingH } = useDepositCooldown(nextDepositAt);

  const unread = settlements.length; // real pending settlement events, not fabricated

  function onGift() {
    if (!canClaimToday) return;
    const credited = claimDaily();
    if (credited > 0) {
      setJustClaimed(credited);
      setTimeout(() => setJustClaimed(0), 2200);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b bg-surface/90 px-3 backdrop-blur-md sm:px-4">
      <HeaderMobileNavTrigger onClick={() => setNavOpen(true)} />
      <HeaderLogo />

      <HeaderNav activeAutomations={activeAutomations} className="mx-auto" />

      <div className="ml-auto flex items-center gap-3">
        {ready && signedIn && (
          <>
            <div className="relative">
              <button
                onClick={onGift}
                title={canClaimToday ? `Claim daily ${usd(dailyBonus)}` : "Daily reward claimed — come back tomorrow"}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full transition-colors",
                  canClaimToday ? "bg-orange-100 text-orange-600 hover:bg-orange-200" : "bg-muted text-sub",
                )}
              >
                <Gift size={16} />
              </button>
              {justClaimed > 0 && (
                <span
                  role="status"
                  aria-live="polite"
                  className="pop absolute top-9 right-0 z-10 whitespace-nowrap rounded-full bg-green-500 px-2 py-1 text-[11px] font-bold text-white shadow-e1"
                >
                  +{usd(justClaimed)} claimed!
                </span>
              )}
            </div>

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
      />
      {signedIn && <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />}
    </header>
  );
}
