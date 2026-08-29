"use client";
import { useTicker } from "./useTicker";

/** Ticks "now" every second and derives the deposit-lock state from
 *  `nextDepositAt` — the same math every header's deposit button needs.
 *  `now` starts at 0 (pre-mount) so locked is always false until the client
 *  has a real clock, avoiding SSR/client drift. */
export function useDepositCooldown(nextDepositAt: number) {
  const now = useTicker(1000);
  const locked = now > 0 && now < nextDepositAt;
  const remainingH = Math.ceil((nextDepositAt - now) / 3600_000);
  return { locked, remainingH };
}
