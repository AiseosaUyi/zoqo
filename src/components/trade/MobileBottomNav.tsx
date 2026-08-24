"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, useActiveNavKey } from "./HeaderChrome";
import { cn } from "@/lib/cn";

/** /trade already docks MobileTradeBar at the phone's bottom edge, sized and
 *  positioned independently of this nav (it predates it, and retrofitting
 *  its exact stacking offset isn't something to guess at blind — see the
 *  handoff notes). It keeps using the existing hamburger-drawer nav
 *  (HeaderMobileNav) instead, which already works and isn't a regression.
 *  /terminal's own mobile action bar is built alongside this nav in the same
 *  pass (MobileTerminalBar), so its stacking offset is authored to match
 *  MOBILE_NAV_HEIGHT_PX exactly rather than reverse-engineered — it does NOT
 *  need to be excluded here. */
function hasOwnMobileActionBar(pathname: string): boolean {
  return pathname === "/trade" || pathname.startsWith("/market");
}

/** Height of the bar's own content box, in px — exported so any bottom-
 *  docked action bar (MobileTradeBar's Buy/Down bar, the terminal's order-
 *  ticket trigger) can sit directly above it instead of guessing a magic
 *  number that drifts from this file. Doesn't include the safe-area inset,
 *  which each consumer adds on top via `env(safe-area-inset-bottom)`. */
export const MOBILE_NAV_HEIGHT_PX = 56;

/** Bottom-padding class every page this nav renders over (i.e. every route
 *  except /trade and /market/*, see hasOwnMobileActionBar below) needs on
 *  its scrollable content so the fixed nav doesn't cover the last bit of
 *  content — one shared constant so five page files reserve the exact same
 *  space instead of five hand-copied guesses that drift the moment this
 *  nav's height changes. Deliberately unprefixed (not `lg:`-scoped) so it
 *  composes with each page's own existing `lg:pb-*` the same way `pb-20
 *  lg:pb-0` already does elsewhere — a page-specific `lg:` override always
 *  wins at that breakpoint regardless of class order, whereas two
 *  same-breakpoint utilities in one className string do not reliably
 *  resolve by source order. */
export const MOBILE_NAV_SAFE_PADDING = "pb-[calc(56px+env(safe-area-inset-bottom)+16px)]";

/** The nav's actual total rendered height, including the safe-area inset it
 *  pads itself with — use this (not MOBILE_NAV_HEIGHT_PX alone) as a `bottom`
 *  CSS value for anything that needs to sit exactly on top of the nav,
 *  e.g. MobileTerminalBar's sticky action bar. */
export const MOBILE_NAV_TOTAL_HEIGHT_CSS = "calc(56px + env(safe-area-inset-bottom))";

/** Persistent five-tab bottom nav for phones (<lg) — TERMINAL_SPEC.md §5's
 *  "mirror how Binance, not a shrunk desktop site, structures its app."
 *  Reuses HeaderChrome's own NAV_ITEMS/useActiveNavKey (the same five
 *  routes every header's nav and mobile drawer already use) rather than a
 *  second hand-copied route list — that drift is exactly what HeaderChrome
 *  itself exists to prevent. Sits alongside the existing hamburger-drawer
 *  nav rather than replacing it; the drawer still carries the portfolio
 *  summary and the referrals link this bar has no room for. */
export function MobileBottomNav() {
  const active = useActiveNavKey();
  const pathname = usePathname();
  if (hasOwnMobileActionBar(pathname)) return null;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-[1440px]" style={{ height: MOBILE_NAV_HEIGHT_PX }}>
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.key;
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold",
                isActive ? "text-purple-700" : "text-sub",
              )}
            >
              <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
