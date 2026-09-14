"use client";
import * as React from "react";
import { useZoqo } from "./store";
import { mulberry32 } from "./math";
import { useLocalStorageState, useHasMounted } from "./useLocalStorageState";
import { useTicker } from "./useTicker";
import { BACKEND_ENABLED, getDataStore } from "./getDataStore";
import { collectLocalStorageSnapshot } from "./dataStore.localStorage";
import { createClient } from "./supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const KEY = "zoqo-profile-v1";

export interface LeaderRow {
  rank: number;
  name: string;
  portfolio: number;
  pnlPct: number;
  you: boolean;
}

interface ProfileState {
  handle: string | null;
  email: string | null;
  avatarSeed: string;
  streak: number;
  bestStreak: number;
  lastClaimDay: string | null; // toDateString()
  claims: number;
  createdAt: number;
}

export type AuthStep = "email" | "otp" | "rewards";

interface ProfileCtx {
  ready: boolean;
  handle: string | null;
  email: string | null;
  signedIn: boolean;
  authOpen: boolean;
  authStep: AuthStep;
  setAuthStep: (s: AuthStep) => void;
  openAuth: () => void;
  closeAuth: () => void;
  /** Returns true (and does nothing) if already signed in. Otherwise opens the
   *  auth modal and, once the flow completes, calls onSuccess for you — so
   *  callers can just do `if (!requireAuth(submit)) return;` at the top of
   *  a gated action. */
  requireAuth: (onSuccess?: () => void) => boolean;
  /** Inline error surfaced by whichever step is active (invalid email format,
   *  invalid referral code). Cleared automatically on step change / retry. */
  authError: string | null;
  setAuthError: (e: string | null) => void;
  /** Validates format, stores the email, and (mocked) "sends" a 6-digit code —
   *  starts the resend countdown and advances to the "otp" step. */
  submitEmail: (email: string) => void;
  /** Epoch ms when "Resend code" becomes available again. */
  otpDeadline: number | null;
  /** Mock-accepts any 6-digit code: derives a handle from the email, credits
   *  the signup bonus once, flips signedIn, and advances to "rewards".
   *  Returns whether verification succeeded, so callers (OtpStep) can revert
   *  their optimistic "verified" UI on failure instead of getting stuck. */
  confirmOtp: (code: string) => Promise<boolean>;
  /** Resets the resend countdown (mocked — no email is actually re-sent). */
  resendOtp: () => void;
  /** Any non-empty code except "000000" is accepted (mirrors the invalid-code
   *  screenshot); an empty code is the "Skip" path. Either way, on success
   *  this closes the modal and runs the action queued via requireAuth. */
  claimRewards: (code?: string) => void;
  avatarSeed: string;
  level: number;
  xp: number;
  xpInto: number; // xp earned into the current level
  xpPerLevel: number;
  xpProgress: number; // 0..1 toward next level
  streak: number;
  bestStreak: number;
  claims: number;
  winRate: number | null; // 0..1, null if no settled trades
  bestPnl: number;
  tradesPlaced: number;
  justLeveledTo: number | null; // set briefly when the user levels up
  canClaimToday: boolean;
  dailyBonus: number; // what claiming now would pay
  setHandle: (h: string) => void;
  claimDaily: () => number; // returns credited amount (0 if already claimed)
  leaderboard: LeaderRow[];
  myRank: number;
}

const INITIAL_PROFILE: ProfileState = {
  handle: null,
  email: null,
  avatarSeed: "trader",
  streak: 0,
  bestStreak: 0,
  lastClaimDay: null,
  claims: 0,
  createdAt: 0,
};

const XP_PER = 150;
const EMAIL_RE = /^\S+@\S+\.\S+$/;
/** Mocked resend countdown — 02:59, matching the Figma reference. */
const OTP_COUNTDOWN_MS = 179_000;

const Ctx = React.createContext<ProfileCtx | null>(null);

export function useProfile() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useProfile must be used within ProfileProvider");
  return c;
}

const dayStr = (d: Date) => d.toDateString();
const bonusFor = (streak: number) => 10 + Math.min(streak, 10) * 5; // $15 → $60

/** Supabase's default mailer caps sends at 2/hour with no custom SMTP
 *  configured — this is the actual root cause behind reports of OTP codes
 *  never arriving. Distinguishing it lets the UI show a message that
 *  explains WHY (and logs a distinct tag), instead of a generic error that
 *  looks identical to a one-off network blip. */
function isRateLimitError(error: { status?: number; code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.status === 429) return true;
  if (error.code && /rate.?limit/i.test(error.code)) return true;
  if (error.message && /rate limit/i.test(error.message)) return true;
  return false;
}

const RATE_LIMIT_MESSAGE = "Too many attempts — please wait a few minutes and try again.";

/** Turns an email local-part into a display handle, e.g. "j.doe_99" → "J Doe". */
function handleFromEmail(email: string | null): string {
  const local = (email ?? "trader").split("@")[0];
  const words = local
    .replace(/[0-9]+/g, " ")
    .split(/[._-]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1));
  return words.join(" ") || "Trader";
}

const LEADER_NAMES = [
  "WhaleByte", "0xMoby", "Leviathan", "Ava B.", "Kai R.", "DeepPockets",
  "Nia P.", "OrcaCap", "Rio M.", "Poseidon", "Yuki T.", "Sol K.",
  "TidalFund", "Amara D.", "Bode N.",
];

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { portfolioValue, netPnl, exposure, grant, stats } = useZoqo();
  const [p, setP] = useLocalStorageState(KEY, INITIAL_PROFILE);
  const ready = useHasMounted();
  // Real wall-clock day, ticking hourly instead of calling `new Date()`
  // straight in render — keeps today/yesterday render-pure while still
  // rolling over on its own if a session is left open across midnight.
  const nowMs = useTicker(3600_000);

  const today = dayStr(new Date(nowMs));
  const canClaimToday = ready && p.lastClaimDay !== today;
  const yesterday = dayStr(new Date(nowMs - 86_400_000));
  const projectedStreak = p.lastClaimDay === yesterday ? p.streak + 1 : 1;
  const dailyBonus = bonusFor(projectedStreak);

  const setHandle = React.useCallback((h: string) => {
    const clean = h.trim().slice(0, 20) || "Trader";
    setP((prev) => ({
      ...prev,
      handle: clean,
      avatarSeed: clean,
      createdAt: prev.createdAt || Date.now(),
    }));
  }, [setP]);

  const claimDaily = React.useCallback((): number => {
    const t = dayStr(new Date());
    let credited = 0;
    setP((prev) => {
      if (prev.lastClaimDay === t) return prev;
      const y = dayStr(new Date(Date.now() - 86_400_000));
      const streak = prev.lastClaimDay === y ? prev.streak + 1 : 1;
      credited = bonusFor(streak);
      return {
        ...prev,
        streak,
        bestStreak: Math.max(prev.bestStreak, streak),
        lastClaimDay: t,
        claims: prev.claims + 1,
      };
    });
    if (credited > 0) grant(credited);
    return credited;
  }, [grant, setP]);

  // ---- real Supabase Auth (Phase B) — inert unless NEXT_PUBLIC_BACKEND_ENABLED
  // is "1", so none of this changes today's mocked-auth behavior by default.
  const supabase = React.useMemo<SupabaseClient | null>(() => (BACKEND_ENABLED ? createClient() : null), []);
  const [session, setSession] = React.useState<{ userId: string; email: string | null } | null>(null);
  React.useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession({ userId: data.session.user.id, email: data.session.user.email ?? null });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ? { userId: newSession.user.id, email: newSession.user.email ?? null } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // Migrate whatever's in localStorage into Postgres exactly once per real
  // sign-in (see the plan's migration-on-first-login step) — guarded by a
  // ref (not state) since this must fire at most once per session
  // regardless of how many times `session` re-renders this effect.
  const migratedRef = React.useRef(false);
  React.useEffect(() => {
    if (!BACKEND_ENABLED || !session || migratedRef.current) return;
    migratedRef.current = true;
    void getDataStore().migrateFromLocalStorage(collectLocalStorageSnapshot());
  }, [session]);

  // Overlay the user's remote profile row once, right after a real sign-in
  // — same "adjust state during render" pattern store.tsx uses for its own
  // persisted-blob hydration, gated on a ref so it only ever applies once
  // per sign-in rather than fighting local edits made afterward.
  const remoteProfileAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (!BACKEND_ENABLED || !session || remoteProfileAppliedRef.current) return;
    remoteProfileAppliedRef.current = true;
    getDataStore()
      .getProfile()
      .then((remote) => {
        if (remote) setP((prev) => ({ ...prev, ...remote }));
      });
  }, [session, setP]);

  // Push local profile edits to Postgres once signed in — additive to the
  // localStorage write useLocalStorageState's own setP already does.
  React.useEffect(() => {
    if (!BACKEND_ENABLED || !session) return;
    void getDataStore().putProfile(p);
  }, [p, session]);

  // ---- auth / onboarding ----
  const SIGNUP_BONUS = 50;
  // Handle is only assigned once the OTP step mock-verifies — that's the
  // moment the user is considered signed in, mirroring the Figma flow where
  // step 3 (rewards) happens *after* the account already exists. In backend
  // mode, the real Supabase session is the actual source of truth instead.
  const signedIn = BACKEND_ENABLED ? session !== null : ready && p.handle !== null;
  const [authOpen, setAuthOpen] = React.useState(false);
  const [authStep, setAuthStep] = React.useState<AuthStep>("email");
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [otpDeadline, setOtpDeadline] = React.useState<number | null>(null);
  const pendingAction = React.useRef<(() => void) | null>(null);
  const credited = React.useRef(false); // guards against double-granting the signup bonus

  // Every open starts at "email" — even if a previous, uncompleted attempt
  // left an email cached in localStorage. Resuming straight into "otp" off
  // that stale value meant a returning visitor could hit the OTP screen
  // without ever entering an email *this* session (and without a fresh code
  // actually having been sent), which read as "how does it know who I am."
  const openAuth = React.useCallback(() => {
    pendingAction.current = null;
    setAuthError(null);
    setAuthStep("email");
    setAuthOpen(true);
  }, []);

  const closeAuth = React.useCallback(() => {
    setAuthOpen(false);
    setAuthError(null);
    pendingAction.current = null;
  }, []);

  const requireAuth = React.useCallback(
    (onSuccess?: () => void): boolean => {
      if (signedIn) return true;
      pendingAction.current = onSuccess ?? null;
      setAuthError(null);
      setAuthStep("email");
      setAuthOpen(true);
      return false;
    },
    [signedIn],
  );

  // Shared by submitEmail and resendOtp so both get identical error capture
  // — previously only submitEmail did, so a failed resend was silent even in
  // principle (a bare `void supabase.auth.signInWithOtp(...)`). Not awaited
  // by callers (fire-and-forget, matching the mock's "advance immediately"
  // shape); a send failure surfaces as an authError without blocking the
  // step change. If the user has since typed/retyped a code and a verify
  // error lands around the same time, whichever call resolves last wins —
  // authError is a single field, so no extra coordination is needed.
  const sendOtp = React.useCallback(
    async (email: string) => {
      if (!BACKEND_ENABLED || !supabase) return;
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (!error) return;
      if (isRateLimitError(error)) {
        console.error("[auth:otp-rate-limited]", error);
        setAuthError(RATE_LIMIT_MESSAGE);
      } else {
        console.error("[auth:otp-send-failed]", error);
        setAuthError(error.message);
      }
    },
    [supabase],
  );

  const submitEmail = React.useCallback((email: string) => {
    const clean = email.trim();
    if (!EMAIL_RE.test(clean)) {
      setAuthError("Please enter a valid email address");
      return;
    }
    setAuthError(null);
    setP((prev) => ({ ...prev, email: clean, createdAt: prev.createdAt || Date.now() }));
    setOtpDeadline(Date.now() + OTP_COUNTDOWN_MS);
    setAuthStep("otp");
    void sendOtp(clean);
  }, [setP, sendOtp]);

  const resendOtp = React.useCallback(() => {
    if (!p.email) return;
    setAuthError(null);
    setOtpDeadline(Date.now() + OTP_COUNTDOWN_MS);
    void sendOtp(p.email);
  }, [sendOtp, p.email]);

  const confirmOtp = React.useCallback(
    async (code: string): Promise<boolean> => {
      if (!/^\d{6}$/.test(code)) return false; // mock-accepts any 6 digits

      const proceed = () => {
        setHandle(handleFromEmail(p.email));
        if (!credited.current) {
          credited.current = true;
          grant(SIGNUP_BONUS);
        }
        setAuthError(null);
        setAuthStep("rewards");
      };

      if (BACKEND_ENABLED && supabase) {
        if (!p.email) return false;
        const { error } = await supabase.auth.verifyOtp({ email: p.email, token: code, type: "email" });
        if (error) {
          if (isRateLimitError(error)) {
            console.error("[auth:otp-rate-limited]", error);
            setAuthError(RATE_LIMIT_MESSAGE);
          } else {
            console.error("[auth:otp-verify-failed]", error);
            setAuthError(error.message);
          }
          return false;
        }
        proceed();
        return true;
      }
      proceed();
      return true;
    },
    [p.email, setHandle, grant, supabase],
  );

  const claimRewards = React.useCallback((code?: string) => {
    const clean = (code ?? "").trim();
    if (clean && clean === "000000") {
      setAuthError("The code you entered is invalid, please double check");
      return;
    }
    setAuthError(null);
    setAuthOpen(false);
    const cb = pendingAction.current;
    pendingAction.current = null;
    if (cb) cb();
  }, []);

  // XP from real activity: daily claims, trades placed, and wins
  const xp = p.claims * 25 + stats.tradesPlaced * 5 + stats.wins * 15;
  const level = 1 + Math.floor(xp / XP_PER);
  const xpInto = xp % XP_PER;
  const xpProgress = xpInto / XP_PER;
  const winRate = stats.wins + stats.losses > 0 ? stats.wins / (stats.wins + stats.losses) : null;

  // brief level-up celebration
  const [justLeveledTo, setJustLeveledTo] = React.useState<number | null>(null);
  const prevLevel = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (prevLevel.current !== null && level > prevLevel.current) {
      setJustLeveledTo(level);
      const t = setTimeout(() => setJustLeveledTo(null), 3800);
      return () => clearTimeout(t);
    }
    prevLevel.current = level;
  }, [level]);

  // leaderboard — synthetic field, stable per day, with "you" slotted by portfolio
  const { leaderboard, myRank } = React.useMemo(() => {
    const seed = Number(today.split(" ").join("").replace(/\D/g, "").slice(0, 8)) || 1;
    const rng = mulberry32(seed);
    const rows = LEADER_NAMES.map((name) => {
      const whale = /Whale|0x|Leviathan|Orca|Tidal|Poseidon|Deep/.test(name);
      const portfolio = (whale ? 1200 : 80) * (0.4 + rng() * 4);
      const pnlPct = (rng() - 0.42) * 60;
      return { name, portfolio, pnlPct, you: false };
    });
    rows.push({
      name: p.handle || "You",
      portfolio: portfolioValue,
      pnlPct: exposure > 0 ? (netPnl / Math.max(1, exposure)) * 100 : 0,
      you: true,
    });
    rows.sort((a, b) => b.portfolio - a.portfolio);
    const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
    const mine = ranked.find((r) => r.you)?.rank ?? ranked.length;
    return { leaderboard: ranked, myRank: mine };
  }, [today, p.handle, portfolioValue, netPnl, exposure]);

  const value: ProfileCtx = {
    ready,
    handle: p.handle,
    email: p.email,
    signedIn,
    authOpen,
    authStep,
    setAuthStep,
    openAuth,
    closeAuth,
    requireAuth,
    authError,
    setAuthError,
    submitEmail,
    otpDeadline,
    confirmOtp,
    resendOtp,
    claimRewards,
    avatarSeed: p.avatarSeed,
    level,
    xp,
    xpInto,
    xpPerLevel: XP_PER,
    xpProgress,
    streak: p.streak,
    bestStreak: p.bestStreak,
    claims: p.claims,
    winRate,
    bestPnl: stats.bestPnl,
    tradesPlaced: stats.tradesPlaced,
    justLeveledTo,
    canClaimToday,
    dailyBonus,
    setHandle,
    claimDaily,
    leaderboard,
    myRank,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
