"use client";
import * as React from "react";
import { useLocalStorageState } from "./useLocalStorageState";
import { useTicker } from "./useTicker";

/** Zoqo Academy — the Duolingo-style learning system (TERMINAL_SPEC.md §6).
 *  One skill tree, real hearts/XP/streak bookkeeping, and all four lesson
 *  mechanics (Signal Spot, Pattern Pop, Build the Order, Mock Trade) with
 *  real content across all seven skills — see `src/lib/lessons/`. */

const KEY = "zoqo-academy-v1";
const MAX_HEARTS = 5;
const HEART_REFILL_MS = 30 * 60_000; // one heart back every 30 min

export interface Skill {
  id: string;
  title: string;
  blurb: string;
  lessonCount: number;
}

export const SKILLS: Skill[] = [
  { id: "foundations", title: "Foundations", blurb: "What a market actually is, and how price is set.", lessonCount: 8 },
  { id: "charts", title: "Reading a Chart", blurb: "Candlesticks, timeframes, support & resistance.", lessonCount: 12 },
  { id: "orders", title: "Order Types", blurb: "Market, limit, stop — and when to use each.", lessonCount: 10 },
  { id: "risk", title: "Risk Management", blurb: "Position sizing, stop-losses, never blow up your account.", lessonCount: 15 },
  { id: "indicators", title: "Indicators", blurb: "Moving averages, RSI, volume — signal vs. noise.", lessonCount: 16 },
  { id: "strategy", title: "Strategy Basics", blurb: "Trend-following, mean-reversion, and picking one.", lessonCount: 18 },
  { id: "psychology", title: "Trading Psychology", blurb: "Why the hardest part is never the chart.", lessonCount: 12 },
];

interface AcademyState {
  xp: number;
  hearts: number;
  lastHeartLostAt: number;
  streak: number;
  lastLessonDay: string | null;
  completedLessons: string[];
}

const INITIAL: AcademyState = {
  xp: 0,
  hearts: MAX_HEARTS,
  lastHeartLostAt: 0,
  streak: 0,
  lastLessonDay: null,
  completedLessons: [],
};

interface AcademyCtx {
  xp: number;
  hearts: number;
  maxHearts: number;
  streak: number;
  completedLessons: string[];
  loseHeart: () => void;
  completeLesson: (lessonId: string, xpEarned: number) => void;
}

const Ctx = React.createContext<AcademyCtx | null>(null);

/** Reads the shared academy state — must be used within AcademyProvider so
 *  that a lesson's completeLesson() and the skill-tree header showing
 *  xp/streak are the same React state, not two independent hook instances
 *  that silently diverge (the bug this replaced: the header stayed frozen
 *  at "0 XP" after finishing a lesson because each useAcademy() call used to
 *  own its own local useState). */
export function useAcademy() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useAcademy must be used within AcademyProvider");
  return c;
}

export function AcademyProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useLocalStorageState(KEY, INITIAL);

  // Passive heart refill — ticks "now" periodically instead of reading
  // Date.now() straight in a memo, so the count is both render-pure and
  // actually updates live as time passes.
  const now = useTicker(30_000);
  const heartsAvailable = React.useMemo(() => {
    if (state.hearts >= MAX_HEARTS || now === 0) return state.hearts;
    const refilled = Math.floor((now - state.lastHeartLostAt) / HEART_REFILL_MS);
    return Math.min(MAX_HEARTS, state.hearts + refilled);
  }, [state.hearts, state.lastHeartLostAt, now]);

  const loseHeart = React.useCallback(() => {
    setState((s) => ({ ...s, hearts: Math.max(0, s.hearts - 1), lastHeartLostAt: Date.now() }));
  }, [setState]);

  const completeLesson = React.useCallback((lessonId: string, xpEarned: number) => {
    setState((s) => {
      const today = new Date().toDateString();
      const streak = s.lastLessonDay === today ? s.streak : s.lastLessonDay ? s.streak + 1 : 1;
      return {
        ...s,
        xp: s.xp + xpEarned,
        streak,
        lastLessonDay: today,
        completedLessons: s.completedLessons.includes(lessonId)
          ? s.completedLessons
          : [...s.completedLessons, lessonId],
      };
    });
  }, [setState]);

  return React.createElement(
    Ctx.Provider,
    {
      value: {
        xp: state.xp,
        hearts: heartsAvailable,
        maxHearts: MAX_HEARTS,
        streak: state.streak,
        completedLessons: state.completedLessons,
        loseHeart,
        completeLesson,
      },
    },
    children,
  );
}
