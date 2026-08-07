"use client";
import * as React from "react";
import { mulberry32 } from "./math";
import { useProfile } from "./profile";

/**
 * Referrals/Rewards mock data — this app has no real backend and no real
 * multi-user referral graph, so there is nothing genuine to read here (unlike
 * trading data, which is never fabricated per CLAUDE.md). Everything below is
 * a *deterministic* function of the signed-in user's `avatarSeed`: same seed
 * in → same numbers out, every reload, forever — never Math.random(). This
 * mirrors the precedent in profile.tsx's `leaderboard` useMemo (mulberry32
 * seeded off a stable string). The one real thing on the page is the
 * referral link + its clipboard copy.
 */

// ---- small deterministic string hash (FNV-1a) → 32-bit seed ----
function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity

/** Short deterministic referral code from a seed string, e.g. "AL-4X9K". */
export function referralCode(seed: string): string {
  const words = (seed || "trader").trim().split(/\s+/).filter(Boolean);
  const letters =
    words
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "ZQ";
  const rng = mulberry32(seedFromString(`${seed}:code`));
  let tail = "";
  for (let i = 0; i < 4; i++) tail += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
  return `${letters.padEnd(2, "Q")}-${tail}`;
}

/** Deterministic, non-cryptographic pseudo-address for activity rows —
 *  same idea/precedent as ProfileHeader.tsx's `pseudoId`, a fresh local copy
 *  since that file isn't ours to import from for an unrelated feature. Draws
 *  straight from the caller's rng (rather than re-hashing a near-identical
 *  seed string per row) so consecutive activity rows don't end up with
 *  visually-repetitive near-identical prefixes. */
function pseudoAddrFromRng(rng: () => number): string {
  const hex = () => Math.floor(rng() * 16).toString(16);
  const head = Array.from({ length: 4 }, hex).join("");
  const tail = Array.from({ length: 4 }, hex).join("");
  return `0x${head}...${tail}`;
}

// ---- tier ladder shared shape: 8 tiers, 10% → 80%, same threshold curve ----
export const TIER_PCTS = [10, 20, 30, 40, 50, 60, 70, 80] as const;
export const TIER_STEPS = [0, 6, 16, 25, 50, 100, 250, 500] as const; // inclusive lower bounds

export interface TierProgress {
  idx: number; // 0-based current tier index
  isMax: boolean;
  progress: number; // 0..1 toward next tier
  remaining: number; // metric units still needed for next tier
  nextMin: number | null;
}

export function tierIndexForValue(mins: readonly number[], value: number): number {
  let idx = 0;
  for (let i = 0; i < mins.length; i++) {
    if (value >= mins[i]) idx = i;
    else break;
  }
  return idx;
}

export function tierProgress(mins: readonly number[], value: number): TierProgress {
  const idx = tierIndexForValue(mins, value);
  const isMax = idx === mins.length - 1;
  const lo = mins[idx];
  const hi = isMax ? lo : mins[idx + 1];
  const span = isMax ? 1 : hi - lo;
  const progress = isMax ? 1 : Math.min(1, Math.max(0, (value - lo) / span));
  return { idx, isMax, progress, remaining: isMax ? 0 : Math.max(0, hi - value), nextMin: isMax ? null : hi };
}

/** "0 - 5" / "500+" style range label for a tier index. `unit` (e.g. "K")
 *  scales the raw step numbers for display without changing the underlying
 *  threshold shape. */
export function tierRangeLabel(i: number, unit: "" | "K" = ""): string {
  const scale = unit === "K" ? 1 : 1;
  const lo = TIER_STEPS[i] * scale;
  if (i === TIER_STEPS.length - 1) return `${lo}${unit}+`;
  const hi = TIER_STEPS[i + 1] * scale - (unit ? 0 : 1);
  return unit ? `${lo}${unit} - ${hi}${unit}` : `${lo} - ${hi}`;
}

export interface ActivityItem {
  id: string;
  kind: "referral" | "rebate";
  title: string;
  subtitle: string;
  amount: number;
  ts: number;
}

export interface PayoutItem {
  id: string;
  dateLabel: string;
  type: string;
  status: "Paid" | "Rolled over";
  amount: number;
  ts: number;
}

export interface ReferralData {
  code: string;
  link: string;
  activeReferees: number;
  referralTier: TierProgress;
  referralPct: number;
  totalEarnedReferrals: number;
  monthlyVolume: number;
  rebateTier: TierProgress;
  rebatePct: number;
  totalEarnedRebates: number;
  totalEarnedAllTime: number;
  pendingPayout: number;
  activity: ActivityItem[];
  payouts: PayoutItem[];
}

/** Pure, deterministic generator: same `seed` always produces the same
 *  ReferralData (activity/payout *dates* are phrased relative to `now`, but
 *  the underlying day-offsets are seeded, so reloading within the same day
 *  reproduces identical output). */
export function generateReferralData(seed: string, now: number = Date.now()): ReferralData {
  const rng = mulberry32(seedFromString(seed || "trader"));

  const activeReferees = 4 + Math.floor(rng() * 56); // 4..59
  const referralTier = tierProgress(TIER_STEPS, activeReferees);
  const referralPct = TIER_PCTS[referralTier.idx];
  const avgFeePerReferee = 60 + rng() * 120; // $60–180 lifetime fees generated per referee
  const totalEarnedReferrals = Math.round(activeReferees * (referralPct / 100) * avgFeePerReferee * 100) / 100;

  const monthlyVolume = Math.round(8_000 + rng() * 250_000);
  const rebateTier = tierProgress(TIER_STEPS.map((s) => s * 1000), monthlyVolume);
  const rebatePct = TIER_PCTS[rebateTier.idx];
  const totalEarnedRebates = Math.round(monthlyVolume * 0.004 * (rebatePct / 100) * 100) / 100;

  const totalEarnedAllTime = Math.round((totalEarnedReferrals + totalEarnedRebates) * 100) / 100;
  const pendingPayout = Math.round(totalEarnedAllTime * (0.03 + rng() * 0.08) * 100) / 100;

  const DAY = 86_400_000;
  const activityCount = 4 + Math.floor(rng() * 3); // 4..6
  let dayCursor = 0;
  const activity: ActivityItem[] = Array.from({ length: activityCount }, (_, i) => {
    dayCursor += 1 + Math.round(rng() * 3);
    const isReferral = rng() > 0.45;
    const ts = now - dayCursor * DAY - Math.floor(rng() * DAY);
    return isReferral
      ? {
          id: `act-${i}`,
          kind: "referral" as const,
          title: "New referee joined",
          subtitle: `${pseudoAddrFromRng(rng)} joined ZOQO`,
          amount: Math.round((8 + rng() * 40) * 100) / 100,
          ts,
        }
      : {
          id: `act-${i}`,
          kind: "rebate" as const,
          title: "Fee rebate credited",
          subtitle: `${new Date(ts).toLocaleDateString("en-US", { month: "long", year: "numeric" })} rebate`,
          amount: Math.round((10 + rng() * 45) * 100) / 100,
          ts,
        };
  }).sort((a, b) => b.ts - a.ts);

  const payoutCount = 5;
  const payouts: PayoutItem[] = Array.from({ length: payoutCount }, (_, i) => {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const share = 0.55 + rng() * 0.9;
    const amount = Math.round(((totalEarnedReferrals / payoutCount) * share) * 100) / 100;
    const status: PayoutItem["status"] = i === 0 && pendingPayout > 0 ? "Rolled over" : "Paid";
    return {
      id: `payout-${i}`,
      dateLabel: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      type: "Referral Bonus",
      status,
      amount,
      ts: d.getTime(),
    };
  });

  const code = referralCode(seed);

  return {
    code,
    link: `zoqo.xyz/r/${code}`,
    activeReferees,
    referralTier,
    referralPct,
    totalEarnedReferrals,
    monthlyVolume,
    rebateTier,
    rebatePct,
    totalEarnedRebates,
    totalEarnedAllTime,
    pendingPayout,
    activity,
    payouts,
  };
}

/** Hook: builds this user's ReferralData once per seed (stable across
 *  reloads/re-renders for the same signed-in user). Returns null when
 *  there's no real seed to derive it from (signed out). */
export function useReferralData(): ReferralData | null {
  const { signedIn, avatarSeed, handle } = useProfile();
  return React.useMemo(() => {
    if (!signedIn) return null;
    return generateReferralData(avatarSeed || handle || "trader");
  }, [signedIn, avatarSeed, handle]);
}

/** Shared copy-to-clipboard state machine — mirrors ShareModal.tsx's
 *  copied/copyFailed pattern so every "Copy" affordance on this page behaves
 *  identically (visible success state + a real failure fallback, never a
 *  silent no-op). */
export function useCopyToClipboard() {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const copy = React.useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 2200);
    }
  }, []);
  return { copied, failed, copy };
}
