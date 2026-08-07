"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
  HeaderNav,
  HeaderStats,
} from "@/components/trade/HeaderChrome";

/** Header for the /automations landing page — shares its logo/nav/deposit/
 *  stats/bell/auth chrome with TopNav via @/components/trade/HeaderChrome,
 *  but stays its own component since TopNav's props are shaped around the
 *  trade page's market-duration selector. */
export function AutomationsHeader() {
  const { portfolioValue, cash, nextDepositAt, settlements } = useZoqo();
  const { ready, signedIn, openAuth } = useProfile();
  const { automations } = useAutomations();
  const activeAutomations = automations.filter((a) => a.enabled).length;
  const [depositOpen, setDepositOpen] = React.useState(false);
  const { locked, remainingH } = useDepositCooldown(nextDepositAt);
  const unread = settlements.length;

  return (
    <header className="sticky top-0 z-30 border-b bg-surface/90 backdrop-blur-md">
      <div className="flex h-[60px] items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <HeaderLogo />

        <HeaderNav activeAutomations={activeAutomations} active="automations" className="ml-2" />

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
        </div>
      </div>

      {/* mobile nav (hidden on sm+, where HeaderNav takes over) */}
      <div className="flex items-center gap-4 border-t px-3 py-2.5 text-[13.5px] font-medium sm:hidden">
        <Link href="/trade" className="text-sub">
          Market
        </Link>
        <Link href="/automations" className="inline-flex items-center gap-1.5 font-bold text-ink">
          Automations
          {activeAutomations > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {activeAutomations}
            </span>
          )}
        </Link>
      </div>

      {signedIn && <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />}
    </header>
  );
}

/** Row below the header carrying the "← Back" link, matching the Figma. */
export function AutomationsBackRow() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-4 sm:px-6">
      <Link
        href="/trade"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-sub hover:text-ink"
      >
        <ArrowLeft size={15} /> Back
      </Link>
    </div>
  );
}

