"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, DollarSign, Gift, Sparkles, TrendingUp } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useProfile } from "@/lib/profile";

/** The single onboarding wizard: email → confirm email (OTP) → welcome
 *  rewards. Mounted once at the app layout and driven entirely by
 *  ProfileProvider's auth state, so any gated action (trade, deposit, claim)
 *  can pop it open mid-flow. Exactly 3 steps — no handle-picking screen, no
 *  separate success screen; claiming or skipping rewards closes the modal
 *  straight back into the app. */
export function AuthModal() {
  const { authOpen, authStep, closeAuth } = useProfile();

  React.useEffect(() => {
    if (!authOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAuth();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authOpen, closeAuth]);

  if (!authOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-gray-900/40 p-4 backdrop-blur-sm"
      onClick={closeAuth}
    >
      <div
        className="pop w-full max-w-[420px] overflow-hidden rounded-[24px] border bg-surface shadow-[0_24px_64px_rgba(22,20,15,0.25)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div key={authStep} className="fade-in">
          {authStep === "email" ? <EmailStep /> : authStep === "otp" ? <OtpStep /> : <RewardsStep />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The diagonal-hatch corner motif shared with MarketChart's "NOT YET
 *  TRADED" zone (same rotated-pattern technique), but neutral gray and
 *  purely decorative — no colored fill behind it. */
function HatchCorner() {
  const id = React.useId();
  return (
    <svg
      className="pointer-events-none absolute right-0 top-0 h-[100px] w-[100px]"
      aria-hidden="true"
    >
      <defs>
        <pattern id={id} width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-gray-300)" strokeWidth="1.1" />
        </pattern>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
    </svg>
  );
}

function EmailStep() {
  const { submitEmail, authError, setAuthError } = useProfile();
  const [email, setEmail] = React.useState("");

  return (
    <div className="relative p-6">
      <HatchCorner />
      <h2 className="font-display text-[28px] font-black leading-none text-ink">Welcome to</h2>
      <p className="mt-1 font-display text-[36px] font-medium leading-none tracking-[0.18em] text-gray-400">
        ZOQO
      </p>

      <label className="mt-7 block text-[12px] font-semibold text-sub">Email</label>
      <Input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (authError) setAuthError(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && submitEmail(email)}
        placeholder="Enter email address"
        size="lg"
        invalid={!!authError}
        className="mt-1.5"
        autoFocus
      />
      {authError && <p className="mt-1.5 text-[12.5px] font-medium text-red-600">{authError}</p>}

      <Button color="brand" size="lg" fullWidth className="mt-4" onClick={() => submitEmail(email)}>
        Continue
      </Button>
      <p className="mt-3 text-center text-[10.5px] text-sub">
        No password, no spam — just play money and live markets.
      </p>
    </div>
  );
}

const secondsUntil = (deadline: number | null) =>
  deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0;

const formatMmSs = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function OtpStep() {
  const { email, otpDeadline, resendOtp, confirmOtp } = useProfile();
  const [digits, setDigits] = React.useState<string[]>(Array(6).fill(""));
  const [verified, setVerified] = React.useState(false);
  const inputsRef = React.useRef<(HTMLInputElement | null)[]>([]);
  const [secondsLeft, setSecondsLeft] = React.useState(() => secondsUntil(otpDeadline));

  React.useEffect(() => {
    setSecondsLeft(secondsUntil(otpDeadline));
    const id = setInterval(() => setSecondsLeft(secondsUntil(otpDeadline)), 1000);
    return () => clearInterval(id);
  }, [otpDeadline]);

  const code = digits.join("");
  // `verified` is intentionally NOT a dependency here — flipping it re-renders
  // for the green-border style, but must not re-run/clean up this effect, or
  // the pending confirmOtp timeout gets cancelled the instant it's scheduled.
  // A ref tracks "already confirming" instead so the effect only fires once
  // per completed code.
  const confirmingRef = React.useRef(false);
  React.useEffect(() => {
    if (code.length !== 6 || confirmingRef.current) return;
    confirmingRef.current = true;
    setVerified(true);
    const t = setTimeout(() => confirmOtp(code), 550);
    return () => clearTimeout(t);
  }, [code, confirmOtp]);

  const setDigitAt = (i: number, raw: string) => {
    if (verified) return;
    const clean = raw.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = clean;
      return next;
    });
    if (clean && i < 5) inputsRef.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputsRef.current[i - 1]?.focus();
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const nums = text.replace(/\D/g, "").slice(0, 6).split("");
      if (!nums.length) return;
      setDigits((prev) => {
        const next = [...prev];
        nums.forEach((d, i) => (next[i] = d));
        return next;
      });
      inputsRef.current[Math.min(nums.length, 6) - 1]?.focus();
    } catch {
      /* clipboard unavailable/denied — mocked flow, ignore silently */
    }
  };

  return (
    <div className="relative p-6">
      <HatchCorner />
      <h2 className="font-display text-[24px] font-black leading-none text-ink">Confirm Email</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-sub">
        The code has been sent to <span className="font-semibold text-ink">{email}</span> please check
        your inbox and paste below.
      </p>

      <div className="mt-6 flex justify-center gap-1.5 sm:gap-2.5">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            value={d}
            onChange={(e) => setDigitAt(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            inputMode="numeric"
            maxLength={1}
            disabled={verified}
            aria-label={`Digit ${i + 1}`}
            className={cn(
              // Deliberately smaller on mobile (40px) than desktop (50px) —
              // 6 boxes at the desktop size need ~430px of viewport to clear
              // the card's padding before its `overflow-hidden` edge, wider
              // than nearly every phone. Flex-shrink is still the backstop
              // for anything narrower than the mobile size accounts for.
              "h-10 w-10 shrink rounded-[10px] border bg-surface text-center text-[16px] font-bold text-ink outline-none transition-colors sm:h-[54px] sm:w-[50px] sm:text-[22px]",
              "focus:border-purple-400 focus:ring-2 focus:ring-purple-100",
              verified && "border-green-500 bg-green-50 text-green-600",
            )}
          />
        ))}
      </div>

      <div className="mt-5 flex justify-center">
        <button
          onClick={paste}
          className="rounded-full border px-4 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-gray-50"
        >
          Paste
        </button>
      </div>

      <p className="mt-4 text-center text-[12px] text-sub">
        {secondsLeft > 0 ? (
          <>Resend code in {formatMmSs(secondsLeft)}</>
        ) : (
          <>
            Didn&apos;t get it?{" "}
            <button onClick={resendOtp} className="font-semibold text-purple-600 hover:underline">
              Resend code
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function RewardsStep() {
  const { claimRewards, authError, setAuthError } = useProfile();
  const [code, setCode] = React.useState("");

  return (
    <div className="p-6">
      <RewardsIllustration />

      <h2 className="mt-1 text-center font-display text-[22px] font-black leading-tight text-ink">
        Claim Your
        <br />
        Welcome Rewards
      </h2>
      <p className="mt-2 text-center text-[13px] text-sub">
        Got invited by a friend? Enter their referral code to unlock
      </p>

      <div className="mt-4 flex items-center justify-center gap-5 rounded-[12px] border bg-muted px-4 py-3">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
          <CheckCircle2 size={15} className="text-green-500" /> Bonus Trading Credits
        </span>
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
          <CheckCircle2 size={15} className="text-green-500" /> Lower Trading Fees
        </span>
      </div>

      <label className="mt-4 block text-[12px] font-semibold text-sub">Referral Code</label>
      <Input
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          if (authError) setAuthError(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && claimRewards(code)}
        placeholder="Enter code"
        size="lg"
        invalid={!!authError}
        className="mt-1.5"
        autoFocus
      />
      {authError && <p className="mt-1.5 text-[12.5px] font-medium text-red-600">{authError}</p>}

      <Button color="brand" size="lg" fullWidth className="mt-4" onClick={() => claimRewards(code)}>
        Claim Rewards
      </Button>
      <button
        onClick={() => claimRewards()}
        className="mt-3 block w-full text-center text-[13px] font-medium text-sub hover:text-ink"
      >
        Skip
      </button>
    </div>
  );
}

/** Tasteful lucide-only approximation of the Figma illustration (trending-up
 *  glyph + gift box + floating coins/sparkles on a soft purple radial) —
 *  intentionally not a pixel clone, per the task's lucide-react-only constraint. */
function RewardsIllustration() {
  return (
    <div className="relative mx-auto mb-1 h-[110px] w-full" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 h-[100px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-50" />
      <div className="absolute left-1/2 top-1 ml-[-86px] -rotate-6 rounded-[10px] border bg-surface p-2 shadow-e2">
        <TrendingUp size={18} className="text-purple-500" strokeWidth={2.5} />
      </div>
      <div className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 shadow-brand">
        <Gift size={30} className="text-white" />
      </div>
      <div className="absolute left-1/2 top-2 grid h-8 w-8 ml-[58px] place-items-center rounded-full bg-purple-500 shadow-e2">
        <DollarSign size={16} className="text-white" strokeWidth={2.5} />
      </div>
      <Sparkles size={13} className="absolute left-1/2 top-0 ml-[-38px] text-gold-500" />
      <Sparkles size={10} className="absolute left-1/2 bottom-2 ml-[46px] text-purple-300" />
    </div>
  );
}
