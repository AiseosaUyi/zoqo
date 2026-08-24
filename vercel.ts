import type { VercelConfig } from "@vercel/config/v1";

/** Vercel project config (see @vercel/config's README). `evaluate-triggers`
 *  (Phase C, TERMINAL_SPEC.md §8) runs once a minute — "once a minute is
 *  plenty at this scale." `daily-digest` (Phase F, §6) runs once a day,
 *  08:00 UTC — a fixed, unambiguous hour rather than trying to localize per
 *  user; day-of-week gating for the weekly "traders to follow" nudge lives
 *  inside that route, not as a second cron entry.
 *
 *  NOTE: Vercel's Hobby (free) plan limits cron jobs to once per day — a
 *  `* * * * *` schedule needs at least a Pro plan to actually run at that
 *  cadence. If this project is on Hobby, either upgrade or reduce
 *  evaluate-triggers to a daily schedule (accepting a much coarser
 *  trigger-evaluation cadence) before relying on this in production. */
export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    { path: "/api/cron/evaluate-triggers", schedule: "* * * * *" },
    { path: "/api/cron/daily-digest", schedule: "0 8 * * *" },
  ],
};
