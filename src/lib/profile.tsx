"use client";
import * as React from "react";
import { useZoqo } from "./store";
import { mulberry32 } from "./math";

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
  avatarSeed: string;
  streak: number;
  bestStreak: number;
  lastClaimDay: string | null; // toDateString()
  claims: number;
  createdAt: number;
}

interface ProfileCtx {
  ready: boolean;
  handle: string | null;
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

const XP_PER = 150;

const Ctx = React.createContext<ProfileCtx | null>(null);

export function useProfile() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useProfile must be used within ProfileProvider");
  return c;
}

const dayStr = (d: Date) => d.toDateString();
const bonusFor = (streak: number) => 10 + Math.min(streak, 10) * 5; // $15 → $60

const LEADER_NAMES = [
  "WhaleByte", "0xMoby", "Leviathan", "Ava B.", "Kai R.", "DeepPockets",
  "Nia P.", "OrcaCap", "Rio M.", "Poseidon", "Yuki T.", "Sol K.",
  "TidalFund", "Amara D.", "Bode N.",
];

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { portfolioValue, netPnl, exposure, grant, stats } = useZoqo();
  const [p, setP] = React.useState<ProfileState>({
    handle: null,
    avatarSeed: "trader",
    streak: 0,
    bestStreak: 0,
    lastClaimDay: null,
    claims: 0,
    createdAt: 0,
  });
  const [ready, setReady] = React.useState(false);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setP((prev) => ({ ...prev, ...(JSON.parse(raw) as ProfileState) }));
    } catch {
      /* ignore */
    }
    loaded.current = true;
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, [p]);

  const today = dayStr(new Date());
  const canClaimToday = ready && p.lastClaimDay !== today;
  const yesterday = dayStr(new Date(Date.now() - 86_400_000));
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
  }, []);

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
  }, [grant]);

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
