"use client";
import * as React from "react";

const QUERY = "(min-width: 1024px)"; // matches Tailwind's `lg` breakpoint

/**
 * The one JS-driven breakpoint check in this codebase — every other
 * responsive decision here is pure `lg:` Tailwind classes, which is enough
 * when the hidden side is a cheap static (Watchlist, OrderTicket). The
 * desktop panel system (TerminalShell's react-resizable-panels tree) can't
 * use that trick: a Group computes its children's flex-basis from JS state,
 * so a CSS-`hidden` Panel would still be counted in that layout math.
 * Scoped to the panel system only — same useSyncExternalStore idiom as
 * useTicker/useHasMounted elsewhere in this codebase, just subscribed to
 * matchMedia instead of an interval or localStorage.
 */
export function useIsDesktop(): boolean {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia(QUERY);
    mql.addEventListener("change", onStoreChange);
    return () => mql.removeEventListener("change", onStoreChange);
  }, []);
  const getSnapshot = React.useCallback(() => window.matchMedia(QUERY).matches, []);
  const getServerSnapshot = React.useCallback(() => false, []);
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
