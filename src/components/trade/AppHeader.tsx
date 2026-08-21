"use client";
import * as React from "react";
import Link from "next/link";
import { Palette, Sparkles } from "lucide-react";
import { useZoqo } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { useAutomations } from "@/lib/automations";
import { useDepositCooldown } from "@/lib/useDepositCooldown";
import { DepositModal } from "./DepositModal";
import { ProfileMenu } from "./ProfileMenu";
import {
  HeaderAuthButtons, HeaderBell, HeaderDepositButton, HeaderLogo, HeaderNav, HeaderStats,
} from "./HeaderChrome";

/** Shared header for the new, non-BTC-specific pages (Terminal, Learn,
 *  Leaderboard) — composed from the same HeaderChrome pieces TopNav /
 *  AutomationsHeader / ProfileTopNav / ReferralsTopNav already use, per the
 *  "one shared chrome, each page composes it" rule in CLAUDE.md. Doesn't
 *  carry TopNav's BTC/duration selector since it isn't scoped to one asset. */
export function AppHeader({ active }: { active: "terminal" | "learn" | "leaderboard" }) {
  const { portfolioValue, cash, nextDepositAt, settlements } = useZoqo();
  const { ready, signedIn, openAuth } = useProfile();
  const { automations } = useAutomations();
  const activeAutomations = automations.filter((a) => a.enabled).length;
  const [depositOpen, setDepositOpen] = React.useState(false);
  const { locked, remainingH } = useDepositCooldown(nextDepositAt);
  const unread = settlements.length;

  return (
    <header className="sticky top-0 z-30 flex h-[56px] items-center gap-3 border-b bg-surface/90 px-4 backdrop-blur-md">
      <HeaderLogo />
      <HeaderNav activeAutomations={activeAutomations} active={active} visibleFrom="sm" className="ml-4" />
      <div className="ml-auto flex items-center gap-3">
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
      {signedIn && <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />}
    </header>
  );
}
