"use client";
import Link from "next/link";
import { Bell, Lock, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";

/** Shared pieces of the app's four header variants (TopNav, AutomationsHeader,
 *  ProfileTopNav, ReferralsTopNav) — each page still composes its own layout
 *  (TopNav carries the BTC/duration selector, ProfileTopNav carries the
 *  claim-daily gift button, etc), but the bits that were being hand-copied
 *  identically four times — and drifting each time — live here once. */

export function HeaderLogo() {
  return (
    <Link href="/trade" className="flex items-center gap-1.5">
      <span className="font-display text-[26px] font-black leading-none tracking-tight text-ink">
        ZOQO
      </span>
    </Link>
  );
}

export function HeaderNav({
  activeAutomations,
  active,
  visibleFrom = "sm",
  className,
}: {
  activeAutomations: number;
  /** which section this header's page belongs to, if either — bolds that
   *  link. Profile/Referrals pages pass neither, since they're not part of
   *  the Market/Automations pair the nav switches between. */
  active?: "market" | "automations";
  /** breakpoint the nav appears at — TopNav's crowded left side (BTC/duration
   *  selector) needs the extra room of `lg`; the lighter headers fit at `sm`. */
  visibleFrom?: "sm" | "lg";
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "hidden items-center gap-6 text-[13.5px] font-medium",
        visibleFrom === "lg" ? "lg:flex" : "sm:flex",
        className,
      )}
    >
      <Link
        href="/trade"
        className={cn(active === "market" ? "font-bold text-ink" : "text-sub hover:text-ink")}
      >
        Market
      </Link>
      <Link
        href="/automations"
        className={cn(
          "inline-flex items-center gap-1.5",
          active === "automations" ? "font-bold text-ink" : "text-sub hover:text-ink",
        )}
      >
        Automations
        {activeAutomations > 0 && (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {activeAutomations}
          </span>
        )}
      </Link>
    </nav>
  );
}

export function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="text-[11px] text-sub">{label}</span>
      <span className="mt-1 text-[14px] font-bold text-ink nums">{value}</span>
    </div>
  );
}

/** Cooldown-aware deposit CTA: green + live when a deposit is available, gold
 *  + locked with a countdown otherwise. Every header that carries a deposit
 *  button shows this same state — no page should let a user tap "Deposit"
 *  into a modal that's actually on cooldown. */
export function HeaderDepositButton({
  locked,
  remainingH,
  onClick,
}: {
  locked: boolean;
  remainingH: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors",
        locked
          ? "bg-gold-100 text-gold-800 hover:bg-gold-200"
          : "bg-green-500 text-white hover:bg-green-600",
      )}
    >
      {locked ? <Lock size={13} /> : <Plus size={14} />}
      {locked ? `Deposit in ${remainingH}h` : "Deposit"}
    </button>
  );
}

export function HeaderBell({ unread }: { unread: number }) {
  return (
    <button className="relative hidden h-8 w-8 place-items-center rounded-full hover:bg-gray-100 lg:grid">
      <Bell size={17} className="text-sub" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[9px] font-bold text-white">
          {unread}
        </span>
      )}
    </button>
  );
}

export function HeaderAuthButtons({ onOpenAuth }: { onOpenAuth: () => void }) {
  return (
    <>
      <button
        onClick={onOpenAuth}
        className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-sub hover:bg-gray-100 hover:text-ink"
      >
        Log in
      </button>
      <button
        onClick={onOpenAuth}
        className="inline-flex items-center gap-1.5 rounded-full bg-purple-500 px-4 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-purple-600"
      >
        Sign up
      </button>
    </>
  );
}

/** Shared portfolio/cash pair — the deposit button sits beside this in every
 *  header, so callers compose the two rather than this owning layout. */
export function HeaderStats({ portfolioValue, cash }: { portfolioValue: number; cash: number }) {
  return (
    <div className="hidden items-center gap-5 sm:flex">
      <HeaderStat label="Portfolio" value={usd(portfolioValue)} />
      <HeaderStat label="Cash" value={usd(cash)} />
    </div>
  );
}
