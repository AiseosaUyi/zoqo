"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Crown, Flame, Gift, Sparkles, Trophy, X } from "lucide-react";
import { Avatar, Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { usd, usdCompact, pct } from "@/lib/format";
import { useProfile } from "@/lib/profile";
import { useZoqo } from "@/lib/store";

const SUGGESTIONS = ["SatoshiSurfer", "MoonOrBust", "GreenCandle", "DiamondPaws", "VegaVibes"];

export function ProfileMenu() {
  const { ready, handle, avatarSeed, level, streak, canClaimToday, dailyBonus, setHandle, claimDaily, myRank, justLeveledTo } =
    useProfile();
  const [open, setOpen] = React.useState(false);
  const [board, setBoard] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!ready) return <Avatar name="You" size="md" />;
  const needsOnboarding = handle === null;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border bg-surface py-1 pl-1 pr-2 hover:bg-gray-50"
      >
        <Avatar name={avatarSeed} size="md" />
        <div className="hidden flex-col items-start leading-none sm:flex">
          <span className="text-[12px] font-bold text-ink">{handle ?? "Sign in"}</span>
          <span className="text-[10px] text-sub">Lv {level}</span>
        </div>
        {streak > 0 && (
          <span className="hidden items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[11px] font-bold text-orange-700 sm:inline-flex nums">
            <Flame size={11} /> {streak}
          </span>
        )}
        <ChevronDown size={14} className="text-sub" />
      </button>

      {open && !needsOnboarding && (
        <ProfilePopover
          onClose={() => setOpen(false)}
          onLeaderboard={() => {
            setOpen(false);
            setBoard(true);
          }}
        />
      )}

      {needsOnboarding && <Onboarding suggestions={SUGGESTIONS} onSet={setHandle} />}
      {board && <Leaderboard onClose={() => setBoard(false)} myRank={myRank} />}
      {justLeveledTo != null && <LevelUpToast level={justLeveledTo} />}

      {/* expose claim state for clarity */}
      <span className="sr-only">{canClaimToday ? `Daily ${dailyBonus} ready` : "claimed"}</span>
      <span className="sr-only" onClick={claimDaily} />
    </div>
  );
}

function LevelUpToast({ level }: { level: number }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center">
      <div className="pop flex items-center gap-3 rounded-[16px] bg-gradient-to-br from-purple-500 to-purple-700 px-5 py-3 text-white shadow-[0_16px_40px_rgba(96,31,255,0.4)]">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white/20">
          <Sparkles size={22} />
        </span>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Level up!</div>
          <div className="text-[18px] font-black leading-none">You reached Level {level}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProfilePopover({ onClose, onLeaderboard }: { onClose: () => void; onLeaderboard: () => void }) {
  const {
    handle, avatarSeed, level, xpInto, xpPerLevel, xpProgress, streak, bestStreak,
    winRate, bestPnl, canClaimToday, dailyBonus, claimDaily, myRank,
  } = useProfile();
  const { portfolioValue, netPnl } = useZoqo();
  const [justClaimed, setJustClaimed] = React.useState(0);

  return (
    <div className="absolute right-0 z-50 mt-2 w-[300px] overflow-hidden rounded-[16px] border bg-surface shadow-[0_16px_40px_rgba(22,20,15,0.18)]">
      {/* header */}
      <div className="bg-gradient-to-br from-purple-500 to-purple-700 p-4 text-white">
        <div className="flex items-center gap-3">
          <Avatar name={avatarSeed} size="lg" className="ring-2 ring-white/40" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-black">{handle}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/85">
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 font-bold">Lv {level}</span>
              <span className="inline-flex items-center gap-0.5 nums">
                <Flame size={11} /> {streak}d
              </span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-white/20">
            <X size={16} />
          </button>
        </div>
        {/* XP progress */}
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] text-white/80 nums">
            <span>{xpInto} / {xpPerLevel} XP</span>
            <span>Lv {level + 1} →</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-500"
              style={{ width: `${Math.round(xpProgress * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-px bg-line">
        <Stat label="Portfolio" value={usd(portfolioValue)} />
        <Stat label="Net P&L" value={`${netPnl >= 0 ? "+" : ""}${usd(netPnl)}`} tone={netPnl >= 0 ? "up" : "down"} />
        <Stat label="Win rate" value={winRate != null ? `${Math.round(winRate * 100)}%` : "—"} />
        <Stat label="Best trade" value={bestPnl > 0 ? `+${usd(bestPnl)}` : "—"} tone={bestPnl > 0 ? "up" : undefined} />
        <Stat label="Rank" value={`#${myRank}`} />
        <Stat label="Best streak" value={`${bestStreak}d`} />
      </div>

      {/* streak milestones */}
      <div className="flex items-center justify-between px-3 pt-3">
        {[3, 7, 14, 30].map((mlt) => {
          const hit = streak >= mlt;
          return (
            <div key={mlt} className="flex flex-col items-center gap-0.5">
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold",
                  hit ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-400",
                )}
              >
                <Flame size={13} />
              </span>
              <span className={cn("text-[10px] nums", hit ? "font-bold text-ink" : "text-sub")}>{mlt}d</span>
            </div>
          );
        })}
      </div>

      {/* daily claim */}
      <div className="p-3">
        {justClaimed > 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-[12px] bg-green-100 py-3 text-[13px] font-bold text-green-700">
            <Check size={16} /> +{usd(justClaimed)} claimed!
          </div>
        ) : (
          <Button
            color={canClaimToday ? "brand" : "gray"}
            variant={canClaimToday ? "solid" : "soft"}
            fullWidth
            disabled={!canClaimToday}
            leftIcon={<Gift size={15} />}
            onClick={() => {
              const c = claimDaily();
              if (c > 0) setJustClaimed(c);
            }}
          >
            {canClaimToday ? `Claim daily ${usd(dailyBonus)}` : "Daily claimed — come back tomorrow"}
          </Button>
        )}
        <button
          onClick={onLeaderboard}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] border py-2 text-[12px] font-semibold hover:bg-gray-50"
        >
          <Trophy size={14} className="text-gold-600" /> View leaderboard
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="bg-surface px-3 py-2">
      <div className="text-[10.5px] text-sub">{label}</div>
      <div
        className={cn(
          "text-[14px] font-bold nums",
          tone === "up" ? "text-green-500" : tone === "down" ? "text-red-500" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Onboarding({ suggestions, onSet }: { suggestions: string[]; onSet: (h: string) => void }) {
  const [val, setVal] = React.useState("");
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-gray-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[400px] overflow-hidden rounded-[20px] border bg-surface shadow-[0_24px_64px_rgba(22,20,15,0.25)]">
        <div className="bg-gradient-to-br from-purple-500 to-purple-700 px-6 py-7 text-white">
          <h2 className="font-display text-[26px] font-black leading-none">Welcome to ZOQO</h2>
          <p className="mt-2 text-[13px] text-white/85">
            Pick a handle. You start with a $50 faucet, a daily streak bonus, and a spot on the leaderboard.
          </p>
        </div>
        <div className="p-5">
          <label className="text-[12px] font-semibold text-sub">Your handle</label>
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="e.g. GreenCandle"
            size="lg"
            className="mt-1.5"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setVal(s)}
                className="rounded-full border px-2.5 py-1 text-[11px] font-medium text-sub hover:bg-gray-50"
              >
                {s}
              </button>
            ))}
          </div>
          <Button
            color="brand"
            size="lg"
            fullWidth
            className="mt-4"
            onClick={() => onSet(val || suggestions[0])}
          >
            Start trading
          </Button>
          <p className="mt-2 text-center text-[10.5px] text-sub">
            Play money. No sign-up, no real funds — your progress saves on this device.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Leaderboard({ onClose, myRank }: { onClose: () => void; myRank: number }) {
  const { leaderboard } = useProfile();
  if (typeof document === "undefined") return null;
  const podium = leaderboard.slice(0, 3);
  const medal = ["text-gold-500", "text-gray-400", "text-brown-500"];
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-gray-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-[460px] flex-col overflow-hidden rounded-[20px] border bg-surface shadow-[0_24px_64px_rgba(22,20,15,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="flex items-center gap-2 font-display text-[20px] font-black">
            <Trophy size={20} className="text-gold-500" /> Leaderboard
          </h2>
          <div className="flex items-center gap-3">
            <Badge color="brand" variant="soft">
              You · #{myRank}
            </Badge>
            <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100">
              <X size={18} className="text-sub" />
            </button>
          </div>
        </div>

        {/* podium */}
        <div className="flex items-end justify-center gap-3 bg-gradient-to-b from-purple-50 to-surface px-5 pb-4 pt-5">
          {[1, 0, 2].map((idx) => {
            const r = podium[idx];
            if (!r) return null;
            const h = idx === 0 ? "h-20" : "h-14";
            return (
              <div key={r.rank} className="flex flex-1 flex-col items-center">
                <Avatar name={r.name} size={idx === 0 ? "lg" : "md"} className={cn(r.you && "ring-2 ring-purple-500")} />
                <div className="mt-1 max-w-full truncate text-[11px] font-bold text-ink">{r.you ? "You" : r.name}</div>
                <div className="text-[10.5px] text-sub nums">{usdCompact(r.portfolio)}</div>
                <div
                  className={cn(
                    "mt-1 flex w-full flex-col items-center justify-end rounded-t-[10px] bg-muted",
                    h,
                  )}
                >
                  <Crown size={16} className={cn("mb-1", medal[idx])} />
                  <span className="mb-1 text-[15px] font-black text-ink nums">{r.rank}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* full list */}
        <div className="scroll-thin flex-1 overflow-auto px-3 py-2">
          {leaderboard.map((r) => (
            <div
              key={r.rank}
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-2 py-2",
                r.you && "bg-purple-50 ring-1 ring-purple-200",
              )}
            >
              <span className="w-6 text-center text-[12px] font-bold text-sub nums">{r.rank}</span>
              <Avatar name={r.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                {r.you ? "You" : r.name}
              </span>
              <span className={cn("text-[12px] font-semibold nums", r.pnlPct >= 0 ? "text-green-500" : "text-red-500")}>
                {pct(r.pnlPct)}
              </span>
              <span className="w-20 text-right text-[13px] font-bold text-ink nums">{usd(r.portfolio)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
