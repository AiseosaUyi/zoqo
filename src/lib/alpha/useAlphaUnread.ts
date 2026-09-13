"use client";
import * as React from "react";
import { BACKEND_ENABLED } from "@/lib/getDataStore";

const ALPHA_UNREAD_KINDS = "proposal,paused,error,kill";
const POLL_MS = 30_000;

/** Count of unacknowledged `alpha_events` (kind proposal/paused/error/kill)
 *  for the signed-in user — drives the Alpha nav badge, same red-pill visual
 *  as the automations badge (docs/alpha/PROMPT-alpha-finish.md §1). Returns
 *  0 with the backend flag unset or signed out, same "degrades gracefully"
 *  contract every other Alpha surface follows. */
export function useAlphaUnread(signedIn: boolean): number {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    // Resetting to 0 on sign-out is a synchronous setState tied directly to
    // the `signedIn` prop change, same shape as /alpha/page.tsx's identical
    // disable comment on its own pending-fetch effect.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!BACKEND_ENABLED || !signedIn) {
      setCount(0);
      return;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/alpha/events?unacknowledged=1&kinds=${ALPHA_UNREAD_KINDS}&limit=50`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const events = await res.json();
        if (!cancelled && Array.isArray(events)) setCount(events.length);
      } catch {
        // Network hiccup or Alpha not provisioned yet — leave the last known count.
      }
    }

    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [signedIn]);

  return count;
}
