"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Bell, Bot, Gift, Lock, Menu, Palette, Plus, Settings as SettingsIcon, Target, Terminal as TerminalIcon, User, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";

/** Shared pieces of the app's five header variants (TopNav, AppHeader,
 *  AutomationsHeader, ProfileTopNav, ReferralsTopNav) — each page still
 *  composes its own layout (TopNav carries the BTC/duration selector,
 *  ProfileTopNav carries the claim-daily gift button, etc), but the bits
 *  that were being hand-copied identically across headers — and drifting
 *  each time — live here once. This also owns the primary nav's route list
 *  and the mobile nav drawer, so every header gets real mobile navigation
 *  and correct active-link state for free instead of re-implementing it. */

export const NAV_ITEMS = [
  { key: "market", href: "/trade", label: "Predict", icon: Target },
  { key: "terminal", href: "/terminal", label: "Trade", icon: TerminalIcon },
  { key: "automations", href: "/automations", label: "Automations", icon: Bot },
] as const;

/** Single source of truth for which nav item the current route belongs to.
 *  Previously every header had to be handed an `active` prop by its caller —
 *  ProfileTopNav and ReferralsTopNav both forgot to, so neither ever
 *  highlighted anything. Deriving it from the URL means that class of bug
 *  can't happen again. /trade and every /market/* deep link both count as
 *  "market" (matches the old TopNav-only comment saying the same). */
export function useActiveNavKey(): (typeof NAV_ITEMS)[number]["key"] | null {
  const pathname = usePathname();
  return React.useMemo(() => {
    if (pathname === "/trade" || pathname.startsWith("/market")) return "market";
    const hit = NAV_ITEMS.find((i) => i.key !== "market" && pathname.startsWith(i.href));
    return hit?.key ?? null;
  }, [pathname]);
}

/** The one focus-visible treatment every interactive header element uses —
 *  matches the ring already standard on Button/Radio/Accordion/etc, applied
 *  here because header nav links and icon buttons were the one part of the
 *  app with no keyboard focus indication at all. */
const NAV_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-1 rounded-[8px]";

export function HeaderLogo() {
  return (
    <Link href="/trade" className={cn("flex items-center gap-1.5", NAV_FOCUS)}>
      <span className="font-display text-[26px] font-black leading-none tracking-tight text-ink">
        ZOQO
      </span>
    </Link>
  );
}

export function HeaderNav({
  activeAutomations,
  visibleFrom = "sm",
  className,
}: {
  activeAutomations: number;
  /** breakpoint the nav appears at — TopNav's crowded left side (BTC/duration
   *  selector) needs the extra room of `lg`; the lighter headers fit at `sm`. */
  visibleFrom?: "sm" | "lg";
  className?: string;
}) {
  const active = useActiveNavKey();
  return (
    <nav
      className={cn(
        "hidden items-center gap-6 text-[13.5px] font-medium",
        visibleFrom === "lg" ? "lg:flex" : "sm:flex",
        className,
      )}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = active === item.key;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 px-0.5 py-0.5",
              NAV_FOCUS,
              isActive ? "font-bold text-ink" : "text-sub hover:text-ink",
            )}
          >
            {item.label}
            {item.key === "automations" && activeAutomations > 0 && (
              <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {activeAutomations}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Hamburger trigger for the mobile nav drawer. `breakpoint` should match
 *  the paired HeaderNav's `visibleFrom` so exactly one of the two is ever
 *  visible at a given width. */
export function HeaderMobileNavTrigger({
  onClick,
  breakpoint = "sm",
}: {
  onClick: () => void;
  breakpoint?: "sm" | "lg";
}) {
  return (
    <button
      onClick={onClick}
      aria-label="Open navigation menu"
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-gray-100",
        breakpoint === "lg" ? "lg:hidden" : "sm:hidden",
        NAV_FOCUS,
      )}
    >
      <Menu size={18} className="text-sub" />
    </button>
  );
}

/** The mobile nav drawer itself — the fix for a real, confirmed gap: below
 *  its header's nav breakpoint, a user previously had no way to reach
 *  Terminal/Learn/Leaderboard/Automations/Referrals/Profile/Settings at all
 *  (Predict was only reachable via the logo). Every header renders one of
 *  these paired with its trigger; state is owned by the calling header
 *  (same pattern as DepositModal's `open`/`onClose`). This is now the ONE
 *  mobile nav surface in the app — there is no separate bottom tab bar
 *  (removed: trading screens need the vertical space more than a persistent
 *  nav chrome does), so it always carries the full NAV_ITEMS list plus
 *  Profile/Settings/Design system. Full mobile-viewport width below `sm`
 *  (a slide-in panel didn't leave room for that much list); capped at a
 *  reasonable drawer width above `sm`, where this can still open on a
 *  tablet-width header. */
export function HeaderMobileNav({
  open,
  onClose,
  activeAutomations,
  signedIn,
  portfolioValue,
  cash,
  onOpenAuth,
}: {
  open: boolean;
  onClose: () => void;
  activeAutomations: number;
  signedIn: boolean;
  portfolioValue?: number;
  cash?: number;
  onOpenAuth?: () => void;
}) {
  const active = useActiveNavKey();
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm sm:block hidden" onClick={onClose} aria-hidden="true" />
      <div className="animate-in slide-in-from-right fade-in absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto bg-surface shadow-[0_24px_64px_rgba(14,17,19,0.25)] duration-200 sm:w-[340px] sm:border-l">
        <div className="flex items-center justify-between border-b px-4 py-3.5">
          <HeaderLogo />
          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className={cn("grid h-9 w-9 place-items-center rounded-full hover:bg-gray-100", NAV_FOCUS)}
          >
            <X size={20} className="text-sub" />
          </button>
        </div>

        {signedIn && portfolioValue != null && cash != null && (
          <div className="grid grid-cols-2 gap-px border-b bg-line">
            <div className="bg-surface px-4 py-3">
              <div className="text-[11px] text-sub">Portfolio</div>
              <div className="mt-0.5 text-[15px] font-bold text-ink nums">{usd(portfolioValue)}</div>
            </div>
            <div className="bg-surface px-4 py-3">
              <div className="text-[11px] text-sub">Cash</div>
              <div className="mt-0.5 text-[15px] font-bold text-ink nums">{usd(cash)}</div>
            </div>
          </div>
        )}

        <nav className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.key;
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14px] font-semibold",
                  NAV_FOCUS,
                  isActive ? "bg-purple-50 text-purple-700" : "text-ink hover:bg-gray-100",
                )}
              >
                <Icon size={17} className={isActive ? "text-purple-600" : "text-sub"} />
                {item.label}
                {item.key === "automations" && activeAutomations > 0 && (
                  <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {activeAutomations}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="my-1 border-t" />

          {signedIn && (
            <Link
              href="/profile"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14px] font-semibold text-ink hover:bg-gray-100",
                NAV_FOCUS,
              )}
            >
              <User size={17} className="text-sub" />
              Profile
            </Link>
          )}
          <Link
            href="/settings"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14px] font-semibold text-ink hover:bg-gray-100",
              NAV_FOCUS,
            )}
          >
            <SettingsIcon size={17} className="text-sub" />
            Settings
          </Link>
          <Link
            href="/system"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14px] font-semibold text-ink hover:bg-gray-100",
              NAV_FOCUS,
            )}
          >
            <Palette size={17} className="text-sub" />
            Design system
          </Link>
        </nav>

        <div className="mt-auto border-t p-3">
          {signedIn ? (
            <Link
              href="/referrals"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14px] font-semibold text-ink hover:bg-gray-100",
                NAV_FOCUS,
              )}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gold-100 text-gold-700">
                <Gift size={14} />
              </span>
              Rewards & referrals
            </Link>
          ) : (
            <button
              onClick={() => {
                onClose();
                onOpenAuth?.();
              }}
              className={cn(
                "w-full rounded-full bg-purple-500 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-purple-600",
                NAV_FOCUS,
              )}
            >
              Log in / Sign up
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
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
        NAV_FOCUS,
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
    <button
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className={cn("relative hidden h-8 w-8 place-items-center rounded-full hover:bg-gray-100 lg:grid", NAV_FOCUS)}
    >
      <Bell size={17} className="text-sub" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[9px] font-bold text-white"
        >
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
        className={cn(
          "rounded-full px-3 py-1.5 text-[13px] font-semibold text-sub hover:bg-gray-100 hover:text-ink",
          NAV_FOCUS,
        )}
      >
        Log in
      </button>
      <button
        onClick={onOpenAuth}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-purple-500 px-4 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-purple-600",
          NAV_FOCUS,
        )}
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
